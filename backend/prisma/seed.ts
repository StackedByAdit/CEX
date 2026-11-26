import { prisma } from "../src/prisma";

const DEFAULT_STOCKS = [
    { symbol: "SOL", title: "Solana" },
    { symbol: "ETH", title: "Ethereum" },
    { symbol: "BTC", title: "Bitcoin" },
    { symbol: "AXIS", title: "Axis Bank" },
];

async function main() {
    console.log("Seeding default stocks...");
    for (const stock of DEFAULT_STOCKS) {
        await prisma.stock.upsert({
            where: { symbol: stock.symbol },
            update: { title: stock.title },
            create: { symbol: stock.symbol, title: stock.title },
        });
        console.log(`- Seeded ${stock.symbol} (${stock.title})`);
    }
    console.log("Seeding complete.");
}

main()
    .catch((err) => {
        console.error("Seed error:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
