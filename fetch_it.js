import http from 'http';
http.get('http://127.0.0.1:3000/api/test-env', res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Response:', body));
});
