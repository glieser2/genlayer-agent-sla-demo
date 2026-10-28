import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {studioRpc,consensusTarget,assertBrowserWalletTarget} from './studio.ts';
export const CHAIN = studionet;
export const NETWORK_NAME = 'Studionet 开发网';
export const EXPLORER = 'https://explorer-studio.genlayer.com';
export type Provider = NonNullable<Parameters<typeof createClient>[0]>['provider'];
export const readClient = createClient({chain: CHAIN});
export const makeWriter = async (account: `0x${string}`, provider: Provider) => {
  const target=consensusTarget(await studioRpc('sim_getConsensusContract',['ConsensusMain']));
  assertBrowserWalletTarget(target);
  const chain={...CHAIN,consensusMainContract:{...CHAIN.consensusMainContract!,address:target}};
  return createClient({chain,account,provider});
};
export async function switchNetwork(provider: NonNullable<Provider>) {
  const chainId=`0x${CHAIN.id.toString(16)}`;
  if(Number(await provider.request({method:'eth_chainId'}))===CHAIN.id)return;
  try {await provider.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}
  catch(e) {
    if((e as {code?:number}).code!==4902)throw e;
    await provider.request({method:'wallet_addEthereumChain',params:[{chainId,chainName:CHAIN.name,nativeCurrency:CHAIN.nativeCurrency,rpcUrls:[...CHAIN.rpcUrls.default.http],blockExplorerUrls:[EXPLORER]}]});
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId}]});
  }
}
export async function checkNetwork() {
  const actual = Number(await readClient.getChainId());
  if (actual !== CHAIN.id || actual !== 61999) throw new Error('RPC 网络身份不匹配，已停止操作。');
  return {chainId: actual, rpc: CHAIN.rpcUrls.default.http[0]};
}
export function contractUrl(value: string) { return `${EXPLORER}/address/${value}`; }
export function transactionUrl(value: string) { return `${EXPLORER}/tx/${value}`; }
