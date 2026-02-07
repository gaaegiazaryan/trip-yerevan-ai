import { PrismaClient, AgencyStatus } from '@prisma/client';

const prisma = new PrismaClient();

const AGENCIES = [
  {
    name: 'Ararat Travel',
    description: 'Full-service travel agency specializing in Armenian destinations and regional tours',
    contactEmail: 'info@ararattravel.am',
    contactPhone: '+37410123456',
    telegramChatId: BigInt(587578971),
    status: AgencyStatus.APPROVED,
    specializations: ['PACKAGE', 'EXCURSION', 'CUSTOM'],
    regions: ['Armenia', 'Georgia', 'Turkey', 'Dubai', 'Egypt', 'Moscow'],
    rating: 4.5,
  },
  {
    name: 'SkyBridge Tours',
    description: 'Budget-friendly flight and hotel packages across Europe and Middle East',
    contactEmail: 'book@skybridgetours.com',
    contactPhone: '+37494567890',
    telegramChatId: BigInt(587578971),
    status: AgencyStatus.APPROVED,
    specializations: ['FLIGHT_ONLY', 'HOTEL_ONLY', 'PACKAGE'],
    regions: ['Dubai', 'Sharm El Sheikh', 'Antalya', 'Barcelona', 'Moscow', 'Tbilisi'],
    rating: 4.2,
  },
  {
    name: 'Caucasus Adventures',
    description: 'Premium custom travel experiences in the Caucasus region',
    contactEmail: 'hello@caucasusadv.am',
    contactPhone: '+37455112233',
    telegramChatId: BigInt(587578971),
    status: AgencyStatus.APPROVED,
    specializations: ['EXCURSION', 'CUSTOM'],
    regions: ['Armenia', 'Georgia', 'Azerbaijan', 'Iran'],
    rating: 4.8,
  },
];

async function main() {
  console.log('Seeding agencies...');

  for (const agency of AGENCIES) {
    const existing = await prisma.agency.findUnique({
      where: { name: agency.name },
    });

    if (existing) {
      console.log(`  Agency "${agency.name}" already exists — skipping`);
      continue;
    }

    await prisma.agency.create({
      data: {
        name: agency.name,
        description: agency.description,
        contactEmail: agency.contactEmail,
        contactPhone: agency.contactPhone,
        telegramChatId: agency.telegramChatId,
        status: agency.status,
        specializations: agency.specializations,
        regions: agency.regions,
        rating: agency.rating,
      },
    });

    console.log(`  Created agency: ${agency.name}`);
  }

  const count = await prisma.agency.count();
  console.log(`Seed complete. Total agencies: ${count}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
