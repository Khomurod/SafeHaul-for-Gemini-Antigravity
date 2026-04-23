const { readFileSync } = require('fs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

async function test() {
  const env = await initializeTestEnvironment({
    projectId: 'test-project',
    firestore: {
      rules: readFileSync('src/firestore.rules', 'utf8'),
    },
  });

  const superAdminContext = env.authenticatedContext('superadmin123', {
    globalRole: 'super_admin'
  });

  try {
    await superAdminContext.firestore().collection('companies').doc('comp123').collection('feature_alerts').get();
    console.log("Success: Super Admin can read feature alerts");
  } catch (e) {
    console.error("Error:", e.message);
  }

  await env.cleanup();
}

test();
