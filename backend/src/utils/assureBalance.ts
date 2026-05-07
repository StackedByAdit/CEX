import { prisma } from "../prisma";

async function assureBalance(userId: string, symbol: string) {

    let balance = await prisma.balance.findFirst({
        where: {
            userId,
            assetType: symbol === "INR" ? "INR" : "STOCK",
            stock: symbol === "INR"
                ? undefined
                : {
                    symbol
                }
        }
    });

    if (!balance) {

        let stockId: string | null = null;

        if (symbol !== "INR") {

            const stock = await prisma.stock.findUnique({
                where: {
                    symbol
                }
            });

            if (!stock) {
                throw new Error("Stock not found");
            }

            stockId = stock.id;
        }

        balance = await prisma.balance.create({
            data: {
                userId,
                stockId,
                assetType: symbol === "INR" ? "INR" : "STOCK",
                available: 0,
                locked: 0
            }
        });
    }

    return balance;
}