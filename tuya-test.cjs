const { TuyaContext } = require('@tuya/tuya-connector-nodejs');
const tuya = new TuyaContext({
  baseUrl: 'https://openapi.tuyaus.com',
  accessKey: 'n4yuamj9d4v7fnupekq4',
  secretKey: 'de1a39f6c2f1447694586273f6fce80e'
});

async function test() {
  try {
    const res = await tuya.request({
      method: 'GET',
      path: '/v1.0/devices/eb8ae4e7d61d9373b52kx9'
    });
    console.log(JSON.stringify(res, null, 2));
    
    if (res.result && res.result.uid) {
      console.log('Fetching all devices for UID:', res.result.uid);
      const devices = await tuya.request({
        method: 'GET',
        path: `/v1.0/users/${res.result.uid}/devices`
      });
      console.log(JSON.stringify(devices, null, 2));
    }
  } catch (error) {
    console.error(error);
  }
}
test();
