// server/services/hdWallet.ts
import { ethers } from "ethers";

/**
 * HD Wallet Service for generating unique deposit addresses per user.
 *
 * BIP44 path for BSC:
 *   m / 44' / 714' / 0' / 0 / {index}
 *
 * MASTER_SEED can be:
 *   - a 12/24-word BIP39 mnemonic, OR
 *   - a hex seed (0x...).
 */

const MASTER_SEED_ENV = "MASTER_SEED";
// NOTE: yahan "m/" NAHI hai; yeh root se relative path hai
const BSC_ACCOUNT_PATH = "44'/714'/0'/0";

/** Get the root HD node (depth = 0, i.e. "m") */
function getHdRoot(): ethers.HDNodeWallet {
  const rawSeed = process.env[MASTER_SEED_ENV];

  if (!rawSeed) {
    throw new Error("MASTER_SEED environment variable not set");
  }

  const masterSeed = rawSeed.trim();
  if (!masterSeed) {
    throw new Error("MASTER_SEED environment variable is empty");
  }

  const wordCount = masterSeed.split(/\s+/).length;

  // Mnemonic case (12+ words)
  if (wordCount >= 12) {
    let mnemonic: ethers.Mnemonic;
    try {
      mnemonic = ethers.Mnemonic.fromPhrase(masterSeed);
    } catch {
      throw new Error(
        "Invalid MASTER_SEED mnemonic. Must be a valid 12/24-word phrase.",
      );
    }
    // This returns root at depth 0 ("m")
    return ethers.HDNodeWallet.fromMnemonic(mnemonic);
  }

  // Hex seed case
  if (!/^0x[a-fA-F0-9]{64,}$/.test(masterSeed)) {
    throw new Error(
      "MASTER_SEED must be either a 12/24-word mnemonic or a 0x-prefixed hex seed",
    );
  }

  try {
    // Also returns root ("m")
    return ethers.HDNodeWallet.fromSeed(masterSeed);
  } catch {
    throw new Error("Invalid MASTER_SEED hex seed");
  }
}

/**
 * Internal helper: get the HD node for a specific derivation index.
 * Path is: m / 44' / 714' / 0' / 0 / {index}
 */
function getHdNodeForIndex(derivationIndex: number): ethers.HDNodeWallet {
  if (!Number.isInteger(derivationIndex) || derivationIndex < 0) {
    throw new Error("derivationIndex must be a non-negative integer");
  }

  const root = getHdRoot();

  // First go to account node: m/44'/714'/0'/0
  const accountNode = root.derivePath(BSC_ACCOUNT_PATH);

  // Then derive child index: m/44'/714'/0'/0/{index}
  return accountNode.derivePath(derivationIndex.toString());
}

/**
 * Derives a unique BSC deposit address for a user.
 */
export function deriveDepositAddress(derivationIndex: number): string {
  const hdNode = getHdNodeForIndex(derivationIndex);
  return hdNode.address.toLowerCase();
}

/**
 * Generates a new master seed mnemonic (for initial setup).
 */
export function generateMasterSeed(): string {
  const wallet = ethers.Wallet.createRandom();
  if (!wallet.mnemonic) {
    throw new Error("Failed to generate mnemonic");
  }
  return wallet.mnemonic.phrase;
}

/**
 * Validates that a master seed is properly formatted.
 */
export function validateMasterSeed(seed: string): boolean {
  const trimmed = seed.trim();
  if (!trimmed) return false;

  try {
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount >= 12) {
      ethers.Mnemonic.fromPhrase(trimmed);
      return true;
    }

    if (!/^0x[a-fA-F0-9]{64,}$/.test(trimmed)) {
      return false;
    }

    ethers.HDNodeWallet.fromSeed(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the private key for a derived address (for sweeper functionality).
 * SECURITY: Only use this for automated sweeping, never expose to users.
 */
export function getDerivedPrivateKey(derivationIndex: number): string {
  const hdNode = getHdNodeForIndex(derivationIndex);
  return hdNode.privateKey;
}
