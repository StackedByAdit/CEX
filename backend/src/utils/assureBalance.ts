import { prisma } from "../prisma";

export async function assureBalance(userId: string, symbol: string) {

    if (symbol === "INR") {
        let balance = await prisma.balance.findFirst({
            where: {
                userId,
                assetType: "INR",
            }
        });

        if (!balance) {
            balance = await prisma.balance.create({
                data: {
                    userId,
                    stockId: null,
                    assetType: "INR",
                    available: 0,
                    locked: 0
                }
            });
        }

        return balance;
    }

    const stock = await prisma.stock.findUnique({
        where: { symbol }
    });

    if (!stock) {
        throw new Error(`Stock not found: ${symbol}`);
    }

    let balance = await prisma.balance.findFirst({
        where: {
            userId,
            assetType: "STOCK",
            stockId: stock.id
        }
    });

    if (!balance) {
        balance = await prisma.balance.create({
            data: {
                userId,
                stockId: stock.id,
                assetType: "STOCK",
                available: 0,
                locked: 0
            }
        });
    }

    return balance;
}