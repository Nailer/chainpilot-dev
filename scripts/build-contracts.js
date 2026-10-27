import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
execFileSync('forge',['build'],{stdio:'inherit'});
const factory=JSON.parse(await readFile('contracts/out/PositionGuardFactory.sol/PositionGuardFactory.json','utf8'));
const vault=JSON.parse(await readFile('contracts/out/PositionGuardVault.sol/PositionGuardVault.json','utf8'));
await mkdir('public',{recursive:true});
await writeFile('public/contracts.json',JSON.stringify({compiler:'solc 0.8.28',factory:{abi:factory.abi,bytecode:factory.bytecode.object},vault:{abi:vault.abi}},null,2));
console.log('Contract transaction bundle written to public/contracts.json');
