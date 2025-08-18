const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  const email = "daniel.brown27@hotmail.com";
  const password = "1234"; 
  const passHash = await argon2.hash(password);

  await prisma.user.upsert({
    where: { email },
    update: {}, 
    create: {
      email,
      passHash,
      roles: "admin",
    },
  });

  console.log("Seeded user:", email, "/", password);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
