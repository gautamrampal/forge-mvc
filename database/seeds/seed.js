require('dotenv').config();
const User = require('../../app/models/User');

// Creates the account you sign in with, plus a couple of extras so the list, the status filter
// and the pagination all have something to show on first run.
async function run() {
  const seeds = [
    { username: 'admin', password: 'Admin@12345', status: 'active' },
    { username: 'jane.doe', password: 'Jane@12345', status: 'active' },
    { username: 'former.employee', password: 'Former@12345', status: 'inactive' },
  ];

  for (const seed of seeds) {
    if (await User.findByUsername(seed.username)) {
      console.log(`skip (exists): ${seed.username}`);
      continue;
    }
    await User.createWithPassword(seed);
    console.log(`created: ${seed.username} / ${seed.password} (${seed.status})`);
  }

  console.log('\nSeeding complete. Sign in at http://localhost:5000/login');
  process.exit(0);
}

run().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
