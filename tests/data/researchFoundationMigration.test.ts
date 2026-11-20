import { spawnSync } from 'node:child_process';
import { migrations } from '@/data/migrations';

test('real SQLite applies research migration additively and enforces owner identity and correction uniqueness',()=>{
  const statements=migrations.find(m=>m.version===16)!.statements;
  const script=`import sqlite3, json, sys
db=sqlite3.connect(':memory:')
db.execute('CREATE TABLE plans (id TEXT PRIMARY KEY, owner_id TEXT)')
db.execute("INSERT INTO plans VALUES ('existing-plan','account-a')")
for sql in json.loads(sys.stdin.read()): db.execute(sql)
db.execute("INSERT INTO research_foundation_blocks(id,owner_id,identity_key,payload_json) VALUES ('a','account-a','same-input','{}')")
db.execute("INSERT INTO research_foundation_blocks(id,owner_id,identity_key,payload_json) VALUES ('b','account-b','same-input','{}')")
try:
 db.execute("INSERT INTO research_foundation_blocks(id,owner_id,identity_key,payload_json) VALUES ('duplicate','account-a','same-input','{}')")
 raise AssertionError('duplicate block accepted')
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO research_foundation_outcomes(id,owner_id,block_id,assignment_id,payload_json) VALUES ('outcome','account-a','a','workout','{}')")
db.execute("INSERT INTO research_foundation_outcomes(id,owner_id,block_id,assignment_id,previous_id,payload_json) VALUES ('correction','account-a','a','workout','outcome','{}')")
try:
 db.execute("INSERT INTO research_foundation_outcomes(id,owner_id,block_id,assignment_id,previous_id,payload_json) VALUES ('fork','account-a','a','workout','outcome','{}')")
 raise AssertionError('correction fork accepted')
except sqlite3.IntegrityError: pass
assert db.execute('SELECT * FROM plans').fetchall()==[('existing-plan','account-a')]
assert db.execute('SELECT COUNT(*) FROM research_foundation_outcomes').fetchone()[0]==2
print('PASS: real SQLite research migration and uniqueness; production rows preserved')
`;
  const result=spawnSync('python',['-c',script],{input:JSON.stringify(statements),encoding:'utf8'});
  expect({status:result.status,error:result.stderr}).toEqual({status:0,error:''});
});

test('real SQLite adds durable pending check-ins without changing existing tracker rows',()=>{
  const statements=migrations.find(m=>m.version===17)!.statements;
  const script=`import sqlite3, json, sys
db=sqlite3.connect(':memory:')
db.execute('CREATE TABLE tracking_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, state TEXT NOT NULL, planned_session_id TEXT)')
db.execute("INSERT INTO tracking_sessions VALUES ('track-a','account-a','saved',NULL)")
for sql in json.loads(sys.stdin.read()): db.execute(sql)
db.execute("INSERT INTO research_pending_checkins VALUES ('account-a','track-a','block-a','assignment-a','2027-01-05T00:00:00Z')")
try:
 db.execute("INSERT INTO research_pending_checkins VALUES ('account-a','track-a','block-b','assignment-b','2027-01-05T00:00:00Z')")
 raise AssertionError('duplicate activity pending link accepted')
except sqlite3.IntegrityError: pass
assert db.execute('SELECT owner_id, state FROM tracking_sessions WHERE id=?',('track-a',)).fetchone()==('account-a','saved')
assert db.execute('SELECT COUNT(*) FROM research_pending_checkins').fetchone()[0]==1
print('PASS: pending check-in migration is additive, account-keyed and duplicate-safe')
`;
  const result=spawnSync('python',['-c',script],{input:JSON.stringify(statements),encoding:'utf8'});
  expect({status:result.status,error:result.stderr}).toEqual({status:0,error:''});
});

test('guided progress migration adds owner-scoped immutable-session linkage without altering workout rows',()=>{
  const statements=migrations.find(m=>m.version===18)!.statements;
  const script=`import sqlite3, json, sys
db=sqlite3.connect(':memory:')
db.execute('CREATE TABLE tracking_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, state TEXT NOT NULL)')
db.execute("INSERT INTO tracking_sessions VALUES ('track-a','account-a','saved')")
for sql in json.loads(sys.stdin.read()): db.execute(sql)
values=('g1','account-a','b1','a1','track-a','fingerprint',0,'{}','2027-01-01')
db.execute('INSERT INTO research_guided_progress VALUES (?,?,?,?,?,?,?,?,?)',values)
try:
 db.execute('INSERT INTO research_guided_progress VALUES (?,?,?,?,?,?,?,?,?)',('g2','account-a','b1','a1','track-b','fingerprint',0,'{}','2027-01-01'))
 raise AssertionError('duplicate assignment progress accepted')
except sqlite3.IntegrityError: pass
try:
 db.execute('INSERT INTO research_guided_progress VALUES (?,?,?,?,?,?,?,?,?)',('g3','account-a','b2','a2','track-a','fingerprint',0,'{}','2027-01-01'))
 raise AssertionError('duplicate session linkage accepted')
except sqlite3.IntegrityError: pass
assert db.execute('SELECT owner_id,state FROM tracking_sessions').fetchone()==('account-a','saved')
print('PASS: guided progress schema is additive and unique per assignment/session')
`;
  const result=spawnSync('python',['-c',script],{input:JSON.stringify(statements),encoding:'utf8'});
  expect({status:result.status,error:result.stderr}).toEqual({status:0,error:''});
});

test('guided voice migration is additive, account-scoped and atomically deduplicates event receipts',()=>{
  const statements=migrations.find(m=>m.version===19)!.statements;
  const script=`import sqlite3, json, sys
db=sqlite3.connect(':memory:')
db.execute('CREATE TABLE tracking_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, state TEXT NOT NULL)')
db.execute("INSERT INTO tracking_sessions VALUES ('track-a','account-a','recording')")
for sql in json.loads(sys.stdin.read()): db.execute(sql)
db.execute("INSERT INTO guided_cue_preferences(owner_id,voice_enabled,muted,countdown_enabled,updated_at) VALUES ('account-a',1,0,0,'now')")
db.execute("INSERT INTO guided_cue_preferences(owner_id,voice_enabled,muted,countdown_enabled,updated_at) VALUES ('account-b',0,1,1,'now')")
sql="INSERT OR IGNORE INTO guided_cue_events(owner_id,session_id,event_id,kind,phase_id,status,claimed_at) VALUES (?,?,?,?,?,'claimed',?)"
args=('account-a','track-a','track-a:phase:run','phase_transition','run','now')
db.execute(sql,args); db.execute(sql,args)
assert db.execute('SELECT COUNT(*) FROM guided_cue_events WHERE owner_id=?',('account-a',)).fetchone()[0]==1
assert db.execute('SELECT COUNT(*) FROM guided_cue_events WHERE owner_id=?',('account-b',)).fetchone()[0]==0
assert db.execute('SELECT owner_id,state FROM tracking_sessions').fetchone()==('account-a','recording')
try:
 db.execute("INSERT INTO guided_cue_events(owner_id,session_id,event_id,kind,status,claimed_at) VALUES ('account-a','track-a','bad','anything','heard','now')")
 raise AssertionError('unrecognized receipt status accepted')
except sqlite3.IntegrityError: pass
print('PASS: cue settings/receipts are account-scoped and deduplicated; tracker row preserved')
`;
  const result=spawnSync('python',['-c',script],{input:JSON.stringify(statements),encoding:'utf8'});
  expect({status:result.status,error:result.stderr}).toEqual({status:0,error:''});
});

test('weekly evidence migration keeps append-only owner-scoped confirmation revisions',()=>{
  const statements=migrations.find(m=>m.version===20)!.statements;
  const script=`import sqlite3, json, sys
db=sqlite3.connect(':memory:')
db.execute('CREATE TABLE tracking_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)')
db.execute("INSERT INTO tracking_sessions VALUES ('existing','account-a')")
for sql in json.loads(sys.stdin.read()): db.execute(sql)
payload=lambda coverage,revision: json.dumps({'ownerId':'account-a','weekStart':'2027-01-04','observationEnd':'2027-01-10','timezone':'UTC','episodeId':None,'sourceId':f's:{revision}','coverage':coverage,'confirmedAt':'now','revision':revision})
db.execute('INSERT INTO research_weekly_evidence VALUES (?,?,?,?,?,?,?,?)',('account-a','2027-01-04','UTC','complete','now',None,1,payload('complete',1)))
db.execute('INSERT INTO research_weekly_evidence VALUES (?,?,?,?,?,?,?,?)',('account-a','2027-01-04','UTC','unknown','later',None,2,payload('unknown',2)))
db.execute('INSERT INTO research_weekly_evidence VALUES (?,?,?,?,?,?,?,?)',('account-b','2027-01-04','UTC','partial','now',None,1,'{}'))
assert db.execute('SELECT coverage FROM research_weekly_evidence WHERE owner_id=? ORDER BY revision',('account-a',)).fetchall()==[('complete',),('unknown',)]
assert db.execute('SELECT COUNT(*) FROM research_weekly_evidence WHERE owner_id=?',('account-b',)).fetchone()[0]==1
assert db.execute('SELECT * FROM tracking_sessions').fetchone()==('existing','account-a')
print('PASS: weekly evidence revisions are additive and owner scoped')
`;
  const result=spawnSync('python',['-c',script],{input:JSON.stringify(statements),encoding:'utf8'});
  expect({status:result.status,error:result.stderr}).toEqual({status:0,error:''});
});
