
import { sequelize } from "./src/db/config";
import UserRole from "./src/db/models/userRole";
import { supabaseAdmin } from "./src/config/supabaseAdmin";

async function checkRoles() {
  try {
    await sequelize.authenticate();
    console.log("Database connected.");

    const roles = await UserRole.findAll();
    console.log("Found roles in DB:", roles.map((r: any) => r.toJSON()));

    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) {
        console.error("Error fetching users from Supabase:", error);
        return;
    }

    console.log("\n--- User Role Mapping ---");
    users.forEach((user: any) => {
        const roleEntry = roles.find((r: any) => r.user_id === user.id);
        console.log(`Email: ${user.email}, ID: ${user.id}, Role: ${roleEntry ? roleEntry.role : 'NONE (Defaults to user)'}`);
    });

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sequelize.close();
  }
}

checkRoles();
