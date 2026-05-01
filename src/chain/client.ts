import { JsonRpcProvider, Wallet } from "ethers";
import { env } from "../config.js";

let providerSingleton: JsonRpcProvider | null = null;
let walletSingleton: Wallet | null = null;

export function getProvider(): JsonRpcProvider {
  if (!providerSingleton) {
    providerSingleton = new JsonRpcProvider(env.BASE_RPC_URL);
  }
  return providerSingleton;
}

export function getForkProvider(): JsonRpcProvider | null {
  if (!env.BASE_FORK_RPC_URL) return null;
  return new JsonRpcProvider(env.BASE_FORK_RPC_URL);
}

export function getWallet(): Wallet | null {
  if (walletSingleton) return walletSingleton;
  if (!env.PRIVATE_KEY) return null;
  walletSingleton = new Wallet(env.PRIVATE_KEY, getProvider());
  return walletSingleton;
}

export function requireWallet(): Wallet {
  const w = getWallet();
  if (!w) throw new Error("PRIVATE_KEY not configured - cannot perform on-chain action");
  return w;
}
