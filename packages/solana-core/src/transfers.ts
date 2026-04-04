import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token'

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

  const fromAta = await getAssociatedTokenAddress(mintPubkey, fromKeypair.publicKey)
  const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey)

  const tx = new Transaction()

  // Create recipient ATA if needed
  try {
    await getAccount(connection, toAta)
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        fromKeypair.publicKey,
        toAta,
        toPubkey,
        mintPubkey,
      ),
    )
  }

  tx.add(
    createTransferInstruction(fromAta, toAta, fromKeypair.publicKey, amount),
  )

  return sendAndConfirmTransaction(connection, tx, [fromKeypair])
}
