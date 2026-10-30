import {address,hash} from './domain.ts';

export type ReviewOrigin = 'local_preview' | 'chain_snapshot' | 'chain_result' | 'synthetic_example';
export type ReviewReceipt = {
  origin: ReviewOrigin;
  caseId: string;
  snapshotSha256: string;
  observedAt: string;
  chainId?: number;
  contract?: string;
  sourceSha256?: string;
};
export type BoundReview = Readonly<ReviewReceipt & {revision: number; sequence: number}>;
type ReadTicket = Readonly<{revision: number; sequence: number}>;

/** Page-memory metadata only. No raw evidence, signing key, or storage access. */
export function createEvidenceReview() {
  let revision=1, sequence=0;
  let active: ReadTicket | null=null;
  let current: BoundReview | null=null;
  const history: BoundReview[]=[];
  const isCurrent=(ticket: ReadTicket)=>ticket===active && ticket.revision===revision;
  return {
    get revision(){return revision;},
    get current(): BoundReview | null {return current && {...current};},
    changed() {revision++;active=null;current=null;},
    begin(): ReadTicket {active=Object.freeze({revision,sequence:++sequence});return active;},
    isCurrent,
    accept(ticket: ReadTicket, receipt: ReviewReceipt): boolean {
      if(!isCurrent(ticket))return false;
      if(!['local_preview','chain_snapshot','chain_result','synthetic_example'].includes(receipt.origin))throw new Error('Unknown assessment origin.');
      if(!receipt.caseId.trim() || [...receipt.caseId].length>80 || !Number.isFinite(Date.parse(receipt.observedAt)))throw new Error('Invalid assessment metadata.');
      hash('0x'+receipt.snapshotSha256);
      const chain=receipt.origin==='chain_snapshot'||receipt.origin==='chain_result';
      if(chain){
        if(receipt.chainId!==61999 || !receipt.contract || !receipt.sourceSha256)throw new Error('Missing verified Studionet provenance.');
        address(receipt.contract);hash('0x'+receipt.sourceSha256);
      }else if(receipt.contract!==undefined || receipt.chainId!==undefined || receipt.sourceSha256!==undefined){
        throw new Error('Local or example results cannot claim on-chain provenance.');
      }
      // Copy known fields, never arbitrary caller fields or the evidence body.
      current=Object.freeze({origin:receipt.origin,caseId:receipt.caseId,snapshotSha256:receipt.snapshotSha256,observedAt:receipt.observedAt,revision,sequence:ticket.sequence,
        ...(chain?{chainId:receipt.chainId,contract:receipt.contract,sourceSha256:receipt.sourceSha256}:{})});
      history.push(current);if(history.length>10)history.shift();active=null;
      return true;
    },
    exportMetadata() {
      return {draftRevision:revision,current:current?{...current}:null,history:history.map(item=>({...item,current:item.sequence===current?.sequence}))};
    },
  };
}
