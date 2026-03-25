const https = require('https');

https.get('https://raw.githubusercontent.com/pinterest/openapi/main/openapi.json', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const spec = JSON.parse(data);
      const pinCreate = spec.components.schemas.PinCreate;
      console.log(JSON.stringify(pinCreate, null, 2));
    } catch (e) {
      console.error(e);
    }
  });
});
