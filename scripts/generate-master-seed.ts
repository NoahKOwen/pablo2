// scripts/generate-master-seed.ts
import { generateMasterSeed } from "../server/services/hdWallet";

console.log("========================================");
console.log(" NEW MASTER SEED (WRITE THIS DOWN) ");
console.log("========================================");
console.log();
console.log(generateMasterSeed());
console.log();
console.log("⚠️ Store this phrase safely (paper / password manager).");
console.log("⚠️ Do NOT commit it to Git. Do NOT share it with anyone.");
