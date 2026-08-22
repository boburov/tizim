import assert from 'node:assert/strict';
import prisma from '../../server_legacy/src/config/prisma.js';

const NEST = process.env.NEST_URL || 'http://127.0.0.1:5000';
const PREFIX = '__ra_';
const stamp = String(process.hrtime.bigint()).slice(-9);

const req = async (path, { token, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(NEST + path, {
    method: 'GET', headers,
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
};

const login = async (l, p) => {
  const r = await fetch(NEST + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: l, password: p })
  });
  const body = await r.json();
  if (r.status === 200) return body.data.accessToken;
  throw new Error(`login ${l}: ${r.status}`);
};

const main = async () => {
  console.log('\n--- ROOM ANALYTICS DASHBOARD TESTS ---\n');
  const ownerToken = await login('owner', 'owner123');

  const before = {
    rooms: await prisma.room.count(),
    groups: await prisma.group.count(),
  };

  const qa = await prisma.user.findFirst({
    where: { username: 'qa_staff_a' }, select: { id: true, homeBranchId: true },
  });
  const branchA = qa.homeBranchId;
  const otherB = await prisma.branch.findFirst({
    where: { isDeleted: false, id: { not: branchA } }, select: { id: true, name: true },
  });

  // 1. Make fixtures
  const roomId = await prisma.room.create({
    data: { branchId: branchA, name: `${PREFIX}room${stamp}`, capacity: 10, isActive: true },
    select: { id: true }
  }).then(r => r.id);

  const groupId = await prisma.group.create({
    data: {
      branchId: branchA, name: `${PREFIX}group${stamp}`, roomId: roomId, isActive: true,
      schedule: { create: [{ day: 'mon', startTime: '10:00', endTime: '12:00' }] }
    },
    select: { id: true }
  }).then(g => g.id);

  try {
    // Basic test
    console.log('Testing /rooms/dashboard');
    const dRes = await req(`/api/branch-analytics/rooms/dashboard?branchId=${branchA}`, { token: ownerToken });
    assert.equal(dRes.status, 200);
    assert.ok(dRes.body.data.kpi);
    console.log('✅ Dashboard endpoint returns 200 and KPI data');

    // Finder test
    console.log('Testing /rooms/finder');
    const fRes = await req(`/api/branch-analytics/rooms/finder?branchId=${branchA}&date=2025-05-23`, { token: ownerToken });
    assert.equal(fRes.status, 200);
    assert.ok(Array.isArray(fRes.body.data));
    console.log('✅ Finder endpoint returns 200 and array data');

    // Schedule test
    console.log('Testing /rooms/schedule');
    const sRes = await req(`/api/branch-analytics/rooms/schedule?branchId=${branchA}&from=2025-05-19&to=2025-05-25`, { token: ownerToken });
    assert.equal(sRes.status, 200);
    assert.ok(Array.isArray(sRes.body.data));
    console.log('✅ Schedule endpoint returns 200 and array data');

    // IDOR & Branch scope protection test
    console.log('Testing IDOR and Branch Scope');
    const qaToken = await req(`/api/users/${qa.id}/password`, { token: ownerToken })
      .then(r => login(r.body.data.username, r.body.data.password));

    // Attempt to read foreign branch without permission/scope
    const fRes2 = await req(`/api/branch-analytics/rooms/dashboard?branchId=${otherB.id}`, { token: qaToken });
    assert.equal(fRes2.status, 403, 'Foreign branch access should be denied (403)');
    console.log('✅ Branch isolation works (foreign branch returned 403)');

  } finally {
    // Cleanup
    await prisma.groupScheduleItem.deleteMany({ where: { groupId } });
    await prisma.group.delete({ where: { id: groupId } });
    await prisma.room.delete({ where: { id: roomId } });

    const after = {
      rooms: await prisma.room.count(),
      groups: await prisma.group.count(),
    };
    assert.deepEqual(after, before, 'Database drift detected!');
    console.log('✅ Database drift is 0');
  }

  console.log('\nAll tests passed successfully.\n');
};

main().catch(console.error);
