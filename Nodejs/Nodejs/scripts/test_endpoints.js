async function test() {
  try {
    const base = 'http://127.0.0.1:5000';
    const convResp = await fetch(base + '/api/conversations');
    console.log('/api/conversations status', convResp.status);
    console.log(await convResp.text());

    const msgResp = await fetch(base + '/api/conversations/1/messages');
    console.log('/api/conversations/1/messages status', msgResp.status);
    console.log(await msgResp.text());
  } catch (err) {
    console.error('Error calling endpoints:', err.message || err);
  }
}

test();
