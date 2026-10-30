import {createAccount, createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {address, hash, parseCase, receiptOutcome} from './domain.ts';
import {STUDIO_RPC, studioRpc, consensusTarget, normalizeStudioTransaction} from './studio.ts';

export const REVIEWED_SOURCE_SHA256='9bab25a9f898d20ec6af13f0e34aa19d395998f973a592d379726e48304dd912';
type LocalAccount=ReturnType<typeof createAccount>;
type Rpc=typeof studioRpc;
export type SessionOperation={kind:'deploy'|'assess';code:string;snapshot:string;contract:string};
export type SessionReview=Readonly<SessionOperation & {account:`0x${string}`;target:`0x${string}`;at:number}>;
const digest=async (s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');

// Only start(true), called by the explicit UI control, creates an account.
// No key import/export, persistence, wallet provider or configurable network.
// The injected account and RPC are used only by isolated source-level tests.
export function createStudioSession(deps:{rpc?:Rpc;newAccount?:()=>LocalAccount;now?:()=>number}={}) {
  const rpc=deps.rpc??studioRpc, newAccount=deps.newAccount??createAccount, now=deps.now??Date.now;
  let account:LocalAccount|null=null, generation=0, busy=false, uncertain=false;
  const reviews=new WeakMap<SessionReview,number>();
  const sent:Array<{hash:`0x${string}`;kind:'deploy'|'assess';contract?:string;outcome:string}>=[];
  async function preflight(expected?:string) {
    if(studionet.id!==61999||studionet.rpcUrls.default.http[0]!==STUDIO_RPC)throw new Error('Test accounts require the fixed official Studionet RPC.');
    if(Number(await rpc('eth_chainId',[]))!==61999)throw new Error('Test account network identity mismatch. Operation stopped.');
    const target=consensusTarget(await rpc('sim_getConsensusContract',['ConsensusMain']));
    if(expected&&target.toLowerCase()!==expected.toLowerCase())throw new Error('The Studio dispatcher changed. Prepare again.');
    if(BigInt(String(await rpc('eth_gasPrice',[])))!==0n)throw new Error('Temporary accounts require zero gasPrice on Studionet. Operation stopped.');
    return target;
  }
  function current(a:LocalAccount, g:number) {
    if(account!==a||generation!==g)throw new Error('The temporary account ended or changed. Prepare again.');
  }
  async function refresh(a:LocalAccount) {
    for(const entry of sent.filter(e=>['pending','unknown'].includes(e.outcome))) {
      const tx=normalizeStudioTransaction(await rpc('gen_getStudioTransactionByHash',[entry.hash]));
      if(tx.sender?.toLowerCase()!==a.address.toLowerCase()||tx.transactionType!==(entry.kind==='deploy'?1:2)||String(tx.value)!=='0')throw new Error('Test transaction receipt sender, type, or value mismatch.');
      entry.outcome=receiptOutcome(tx);entry.contract=tx.contract;
    }
    if(sent.some(e=>['pending','unknown'].includes(e.outcome)))throw new Error('An existing test transaction is unresolved. Keep querying its original ID.');
  }
  async function readyForAssess(a:LocalAccount, review:SessionOperation) {
    await refresh(a);
    const contract=address(review.contract);
    if(!sent.some(e=>e.kind==='deploy'&&e.outcome==='success'&&e.contract?.toLowerCase()===contract.toLowerCase()))throw new Error('Assessment requires a confirmed deployment from this page session. Other contracts remain read-only.');
    const client=createClient({chain:studionet,endpoint:STUDIO_RPC});
    if(await digest(await client.getContractCode(contract))!==REVIEWED_SOURCE_SHA256)throw new Error('Deployed source verification failed.');
    const raw=await client.readContract({address:contract,functionName:'get_snapshot',args:[]});
    if(raw!==review.snapshot)throw new Error('The on-chain snapshot does not match the review.');
    if(await client.readContract({address:contract,functionName:'get_result',args:[]})!=='')throw new Error('This contract already has a result. assess cannot run again.');
  }
  return {
    get address(){return account?.address;},
    get uncertain(){return uncertain;},
    async start(confirmed:boolean) {
      if(!confirmed)throw new Error('Confirm temporary-account use in this page first.');
      if(busy)throw new Error('A test-account operation is still running.');
      if(account)return account.address;
      if(uncertain)throw new Error('Broadcast state unknown. A new account cannot be created to retry in this page.');
      busy=true;const g=generation;
      try{await preflight();if(g!==generation)throw new Error('Account creation canceled.');account=newAccount();sent.length=0;return account.address;}
      finally{busy=false;}
    },
    end(){generation++;account=null;},
    async prepare(input:SessionOperation):Promise<SessionReview> {
      const op=Object.freeze({...input});
      if(busy||uncertain)throw new Error('An operation is running or its broadcast state is unknown. Check the original transaction before proceeding.');
      const a=account,g=generation;if(!a)throw new Error('Create a temporary account in this page first.');
      parseCase(op.snapshot);
      if(await digest(op.code)!==REVIEWED_SOURCE_SHA256)throw new Error('This source is not the reviewed Agent SLA contract. Operation stopped.');
      if(op.kind==='assess')await readyForAssess(a,op);
      else {if(op.kind!=='deploy'||op.contract!=='')throw new Error('Invalid test operation.');await refresh(a);}
      const target=await preflight();current(a,g);
      const review=Object.freeze({...op,account:a.address,target,at:now()});reviews.set(review,generation);return review;
    },
    async submit(review:SessionReview, confirmed:boolean) {
      if(!confirmed)throw new Error('Explicitly confirm this test operation.');
      if(busy||uncertain||!reviews.has(review))throw new Error('The review was already used or the operation state is unknown. Do not resubmit.');
      // Consume before any await, including failures. No second signature on SDK ABI fallback.
      const reviewedGeneration=reviews.get(review);reviews.delete(review);busy=true;const a=account,g=generation;let signed=false;
      try {
        if(!a||a.address!==review.account||reviewedGeneration!==generation||now()-review.at>300000)throw new Error('The account or review expired. Prepare again.');
        const target=await preflight(review.target);current(a,g);await refresh(a);
        if(review.kind==='assess')await readyForAssess(a,review);
        const guardedAccount={...a,signTransaction:async (...args:Parameters<NonNullable<LocalAccount['signTransaction']>>) => {
          if(signed)throw new Error('Only one signature is allowed per review. ABI fallback cannot sign again.');
          const tx=args[0];current(a,g);
          if(tx.chainId!==61999||tx.to?.toLowerCase()!==target.toLowerCase()||BigInt(tx.value??0)!==0n||BigInt(tx.gasPrice??-1)!==0n)throw new Error('Test transaction network, dispatcher, value, or fee mismatch. Operation stopped.');
          await preflight(target);current(a,g);
          if(now()-review.at>300000)throw new Error('The review expired before signing.');
          signed=true;return a.signTransaction!(...args);
        }} as LocalAccount;
        const chain={...studionet,consensusMainContract:{...studionet.consensusMainContract!,address:target}};
        const client=createClient({chain,endpoint:STUDIO_RPC,account:guardedAccount});
        current(a,g);
        const id=review.kind==='deploy'
          ?await client.deployContract({code:review.code,args:[review.snapshot]})
          :await client.writeContract({address:address(review.contract),functionName:'assess',args:[],value:0n});
        hash(id);sent.push({hash:id,kind:review.kind,outcome:'pending'});return id;
      } catch(e) {if(signed)uncertain=true;throw e;}
      finally{busy=false;}
    }
  };
}
