import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapKeeper } from '../src/keeper-bootstrap.js';

test('host bootstrap reuses its key and returns only the public execution address',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'chainpilot-keeper-'));
  try {
    const env={INIT_KEEPER_ON_START:'true',KEEPER_KEY_FILE:join(dir,'keeper.key')};
    const first=await bootstrapKeeper(env),second=await bootstrapKeeper(env);
    assert.equal(first.KEEPER_ADDRESS,second.KEEPER_ADDRESS);
    assert.match(first.KEEPER_ADDRESS,/^0x[\da-fA-F]{40}$/);
    assert.equal((await stat(env.KEEPER_KEY_FILE)).mode&0o777,0o600);
    assert.deepEqual(Object.keys(first).sort(),['INIT_KEEPER_ON_START','KEEPER_ADDRESS','KEEPER_KEY_FILE']);
    await assert.rejects(()=>bootstrapKeeper({...env,KEEPER_ADDRESS:'0x0000000000000000000000000000000000000001'}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
