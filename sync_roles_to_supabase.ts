
import { sequelize } from "./src/db/config";
import UserRole from "./src/db/models/userRole";
import { supabaseAdmin } from "./src/config/supabaseAdmin";

async function syncRoles() {
  try {
    await sequelize.authenticate();
    console.log("Database connected.");

    const roles = await UserRole.findAll();
    console.log(`Found ${roles.length} roles in DB.`);

    for (const roleEntry of roles) {
        const userId = roleEntry.user_id;
        const roleName = roleEntry.role;

        console.log(`Syncing role '${roleName}' for user ${userId}...`);

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            app_metadata: { role: roleName }
        });

        if (error) {
            console.error(`Failed to update Supabase for user ${userId}:`, error.message);
        } else {
            console.log(`Success.`);
        }
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sequelize.close();
  }
}

syncRoles();
