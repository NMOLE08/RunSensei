import { ExpoSqliteDatabase } from '@/data/expoSqliteDatabase';

test('publication uses the exclusive SQLite connection without routing GPS queries into it',async()=>{
  const transaction={execAsync:jest.fn(async()=>undefined),runAsync:jest.fn(async()=>({changes:1,lastInsertRowId:1}))};
  const native={withExclusiveTransactionAsync:jest.fn(async (operation:any)=>operation(transaction)),runAsync:jest.fn(async()=>({changes:1,lastInsertRowId:2}))};
  const database=new ExpoSqliteDatabase(native as any);
  await database.exclusiveTransaction(async scoped=>{
    await scoped.run('INSERT publication');
    await database.run('UPDATE gps');
  });
  expect(transaction.runAsync).toHaveBeenCalledWith('INSERT publication');
  expect(native.runAsync).toHaveBeenCalledWith('UPDATE gps');
  expect(transaction.execAsync).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000');
});
