require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Sequelize } = require('sequelize');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

async function syncAllRoles() {
  try {
    // Get all roles from database
    const [roles] = await sequelize.query('SELECT user_id, role FROM user_roles');
    console.log('Found roles in database:', roles);

    // Sync each role to Supabase app_metadata
    for (const r of roles) {
      console.log(`Syncing ${r.user_id} -> ${r.role}`);
      const { error } = await supabase.auth.admin.updateUserById(r.user_id, {
        app_metadata: { role: r.role }
      });
      if (error) {
        console.error(`  Error: ${error.message}`);
      } else {
        console.log(`  ✅ Done`);
      }
    }

    console.log('\n✅ All roles synced to Supabase app_metadata!');
    console.log('\n⚠️  Users need to LOG OUT and LOG BACK IN to get the new JWT.');
    
    await sequelize.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

syncAllRoles();
