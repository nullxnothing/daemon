import * as SecureStore from 'expo-secure-store';

const KEYS = {
  WALLET_PRIVATE_KEY: 'daemon_wallet_pk',
  RPC_ENDPOINT: 'daemon_rpc_endpoint',
  HELIUS_API_KEY: 'daemon_helius_key',
  API_TOKEN: 'daemon_api_token',
} as const;

type StoreKey = (typeof KEYS)[keyof typeof KEYS];

async function save(key: StoreKey, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch {
    return false;
  }
}

async function load(key: StoreKey): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function remove(key: StoreKey): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(key);
    return true;
  } catch {
    return false;
  }
}

async function has(key: StoreKey): Promise<boolean> {
  const value = await load(key);
  return value !== null;
}

export const secureStore = {
  KEYS,

  saveWalletKey: (pk: string) => save(KEYS.WALLET_PRIVATE_KEY, pk),
  loadWalletKey: () => load(KEYS.WALLET_PRIVATE_KEY),
  removeWalletKey: () => remove(KEYS.WALLET_PRIVATE_KEY),
  hasWalletKey: () => has(KEYS.WALLET_PRIVATE_KEY),

  saveRpcEndpoint: (url: string) => save(KEYS.RPC_ENDPOINT, url),
  loadRpcEndpoint: () => load(KEYS.RPC_ENDPOINT),

  saveHeliusKey: (key: string) => save(KEYS.HELIUS_API_KEY, key),
  loadHeliusKey: () => load(KEYS.HELIUS_API_KEY),

  saveApiToken: (token: string) => save(KEYS.API_TOKEN, token),
  loadApiToken: () => load(KEYS.API_TOKEN),
  removeApiToken: () => remove(KEYS.API_TOKEN),

  save,
  load,
  remove,
  has,
} as const;
