import assert from 'node:assert/strict';
const http = process.env.PUTOWN_TEST_HTTP ?? 'http://localhost:8080';
const clientUrl = process.env.PUTOWN_TEST_CLIENT ?? 'http://localhost:5173/';
const clients = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect() {
  const socket = new WebSocket(new URL('/ws/game', http).href.replace(/^http/, 'ws'));
  const events = [];
  socket.addEventListener('message', event => events.push(JSON.parse(event.data)));
  const client = { socket, events, send(type, fields = {}) { socket.send(JSON.stringify({ version: 1, type, ...fields })); },
    latest(type) { return events.findLast(event => event.type === type); },
    async wait(type, predicate = () => true, after = 0) {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const event = events.slice(after).findLast(event => event.type === type && predicate(event));
        if (event) return event;
        await delay(25);
      }
      throw new Error('Timed out waiting for ' + type);
    }
  };
  clients.push(client);
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('WebSocket handshake timed out')), 10_000);
    socket.addEventListener('open', () => { clearTimeout(deadline); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(deadline); reject(error); }, { once: true });
  });
  return client;
}
try {
  assert.deepEqual(await (await fetch(http + '/health', { signal: AbortSignal.timeout(10_000) })).json(), { status: 'healthy' });
  const frontend = await fetch(clientUrl, { signal: AbortSignal.timeout(10_000) });
  assert.equal(frontend.status, 200);
  assert.match(await frontend.text(), /src\/main\.ts/);
  const host = await connect();
  host.send('create_room', { displayName: 'Verification Host' });
  const snapshot = await host.wait('room_snapshot');
  assert.equal((await fetch(http + '/rooms/' + snapshot.roomId + '/avatars', { signal: AbortSignal.timeout(10_000) })).status, 200);
  for (let i = 1; i < 4; i++) {
    const client = await connect();
    client.send('join_room', { roomId: snapshot.roomId, displayName: 'Verification ' + i });
    await client.wait('room_snapshot');
  }
  const roster = [...clients];
  for (const client of roster) client.send('set_ready', { ready: true });
  await host.wait('room_state', event => event.players.every(player => player.ready));
  host.send('start_game');
  await Promise.all(roster.map(client => client.wait('game_state', event => event.phase === 'day')));
  const actor = roster.find(client => client !== host && client.latest('game_state').self.faction === 'village');
  const tasks = await actor.wait('task_state');
  assert.equal(tasks.tasks.length, 3);
  assert.deepEqual(tasks.tasks.map(task => task.kind), ['repair', 'sequence', 'delivery']);
  await actor.wait('field_state');
  async function walk(x, y) {
    let { x: atX, y: atY } = actor.latest('field_state').self;
    while (Math.hypot(x - atX, y - atY) > .01) {
      const distance = Math.hypot(x - atX, y - atY), step = Math.min(20, distance);
      atX += (x - atX) * step / distance;
      atY += (y - atY) * step / distance;
      actor.send('move', { x: atX, y: atY, facing: 'down' });
      await delay(120);
    }
    await actor.wait('field_state', event => Math.hypot(event.self.x - x, event.self.y - y) < .01);
  }
  await walk(1280, 742);
  await walk(1280, 544);
  const counts = roster.map(client => client.events.filter(event => event.type === 'task_state').length);
  const taskId = tasks.tasks[0].taskId;
  actor.send('open_task', { round: 1, taskId });
  await actor.wait('task_state', event => event.activeTaskId === taskId);
  await delay(4200);
  actor.send('task_step', { round: 1, taskId, step: 0, value: 0 });
  await actor.wait('task_state', event => event.tasks[0].step === 1);
  for (let i = 0; i < roster.length; i++) if (roster[i] !== actor)
    assert.equal(roster[i].events.filter(event => event.type === 'task_state').length, counts[i]);
  const identity = actor.latest('room_snapshot');
  actor.socket.close();
  await delay(100);
  const recovered = await connect();
  recovered.send('recover_room', { roomId: snapshot.roomId, recoveryToken: identity.recoveryToken });
  const restored = await recovered.wait('room_snapshot');
  assert.equal(restored.selfPlayerId, identity.selfPlayerId);
  assert.equal((await recovered.wait('task_state')).tasks[0].step, 1);
  recovered.send('leave_room');
  await recovered.wait('room_left');
  for (const client of roster.filter(client => client !== actor)) {
    client.send('leave_room');
    await client.wait('room_left');
  }
  console.log(JSON.stringify({ health: true, frontendHttp: true, avatarCollectionHttp: true, independentClients: 4,
    createJoinReadyStart: true, acceptedMovement: true, privateTimedRepair: true, retainedRecovery: true,
    acknowledgedLeave: true, browserAutomation: false }));
} finally {
  for (const client of clients) client.socket.close();
}
