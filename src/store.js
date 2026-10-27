import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { jsonSafe } from './chain/venus.js';

/** Server and one worker may share this directory on the same persistent volume. */
export class Store {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve(); }
  async read() {
    try { return JSON.parse(await readFile(join(this.directory, 'state.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { enrollments: {}, receipts: [], observations: [] }; throw error; }
  }
  async update(fn) {
    const task = this.queue.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const lock=join(this.directory,'.state.lock');
      let acquired=false;
      for(let attempt=0;attempt<100;attempt++) {
        try {await mkdir(lock);acquired=true;break;} catch(error) {
          if(error.code!=='EEXIST') throw error;
          try {if(Date.now()-(await stat(lock)).mtimeMs>60000) await rm(lock,{recursive:true,force:true});} catch(error) {if(error.code!=='ENOENT')throw error;}
          await new Promise(resolve=>setTimeout(resolve,50));
        }
      }
      if(!acquired) throw new Error('State store is busy');
      try {
        const data = await this.read();
        const result = await fn(data);
        const file = join(this.directory, 'state.json');
        await writeFile(`${file}.${process.pid}.tmp`, JSON.stringify(jsonSafe(data),null,2), { mode: 0o600 });
        await rename(`${file}.${process.pid}.tmp`,file);
        return result;
      } finally {await rm(lock,{recursive:true,force:true});}
    });
    this.queue = task.catch(() => {});
    return task;
  }
  enroll(entry) { return this.update(data => { data.enrollments[entry.vault.toLowerCase()] = entry; }); }
  record(collection, item) { return this.update(data => {
    if (!['receipts','observations'].includes(collection)) throw new Error('Invalid collection');
    data[collection].push(jsonSafe(item));
    data[collection] = data[collection].slice(-10000);
  }); }
}
