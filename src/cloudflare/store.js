import { jsonSafe } from '../chain/venus.js';
const empty=()=>({enrollments:{},receipts:[],observations:[]});
/** SQLite-backed DO storage, accessed only by the one serialized agent instance. */
export class DurableStore {
  constructor(storage){this.storage=storage;}
  async read(){return await this.storage.get('state')||empty();}
  async update(fn){const data=await this.read();const result=await fn(data);await this.storage.put('state',jsonSafe(data));return result;}
  enroll(entry){return this.update(data=>{data.enrollments[entry.vault.toLowerCase()]=entry;});}
  record(collection,item){return this.update(data=>{if(!['receipts','observations'].includes(collection))throw new Error('Invalid collection');data[collection].push(jsonSafe(item));data[collection]=data[collection].slice(-500);});}
}
