import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js'

type SplTokenModule = typeof import('@solana/spl-token')
let splTokenModulePromise: Promise<SplTokenModule> | null = null

async function getSplTokenModule(): Promise<SplTokenModule> {
  if (!splTokenModulePromise) {
    splTokenModulePromise = import('@solana/spl-token')
  }
  return splTokenModulePromise
}

export async function transferSOL(
  connection: Connection,
  fromKeypair: Keypair,
  toAddress: string,
  amountSol: number,
): Promise<string> {
  const toPubkey = new PublicKey(toAddress)
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL)

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey,
      lamports,
    }),
  )

  return sendAndConfirmTransaction(connection, tx, [fromKeypair])
}

export async function transferSPLToken(
  connection: Connection,
  fromKeypair: Keypair,
  toAddress: string,
  mint: string,
  amount: number,
): Promise<string> {
  const mintPubkey = new PublicKey(mint)
  const toPubkey = new PublicKey(toAddress)
  const splToken = await getSplTokenModule()

  const fromAta = await splToken.getAssociatedTokenAddress(mintPubkey, fromKeypair.publicKey)
  const toAta = await splToken.getAssociatedTokenAddress(mintPubkey, toPubkey)

  const tx = new Transaction()

  // Create recipient ATA if needed
  try {
    await splToken.getAccount(connection, toAta)
  } catch {
    tx.add(
      splToken.createAssociatedTokenAccountInstruction(
        fromKeypair.publicKey,
        toAta,
        toPubkey,
        mintPubkey,
      ),
    )
  }

  tx.add(
    splToken.createTransferInstruction(fromAta, toAta, fromKeypair.publicKey, amount),
  )

  return sendAndConfirmTransaction(connection, tx, [fromKeypair])
}
