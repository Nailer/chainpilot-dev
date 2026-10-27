import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';

/** Creates a service execution key inside the host's private persistent storage.
 * Never returns or prints the secret. Does not fund or send any transaction.
 */
export async function bootstrapKeeper(env) {
  if(env.INIT_KEEPER_ON_START!=='true') return {...env};
  const file=env.KEEPER_KEY_FILE;
  if(!file)throw new Error('Set KEEPER_KEY_FILE to a path on private persistent storage');
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  try {await writeFile(file,generatePrivateKey(),{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;}
  let account;
  try {account=privateKeyToAccount((await readFile(file,'utf8')).trim());}
  catch {throw new Error('Keeper file is not a valid private key');}
  if(env.KEEPER_ADDRESS&&env.KEEPER_ADDRESS.toLowerCase()!==account.address.toLowerCase())throw new Error('Existing keeper address does not match persistent key');
  return {...env,KEEPER_ADDRESS:account.address};
}
