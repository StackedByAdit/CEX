import axios from "axios";

const BASE_URL = "http://localhost:3000";

const USERS = [
    { username: `trader_${Date.now()}_1`, password: "password123" },
    { username: `trader_${Date.now()}_2`, password: "password123" },
];

const SYMBOLS = ["SOL"];

let tokens: string[] = [];

async function signup(username: string, password: string) {
    try {
        await axios.post(`${BASE_URL}/signup`, { username, password });
        console.log(`[SIGNUP] ${username} created`);
    } catch (e: any) {
        console.log(`[SIGNUP FAIL] ${username}: ${e?.response?.data?.message ?? e.message}`);
    }
}

async function login(username: string, password: string): Promise<string> {
    const res = await axios.post(`${BASE_URL}/login`, { username, password });
    console.log(`[LOGIN] ${username} token: ${res.data.token}`);
    return res.data.token;
}

async function placeOrder(token: string) {
    const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
    const side = Math.random() > 0.5 ? "BUY" : "SELL";
    const price = Math.floor(Math.random() * 40) + 80;
    const quantity = Math.floor(Math.random() * 10) + 1;

    try {
        await axios.post(
            `${BASE_URL}/order`,
            { side, type: "LIMIT", symbol, price, quantity },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log(`[ORDER] ${side} ${quantity} ${symbol} @ ${price}`);
    } catch (err: any) {
        console.log(`[FAIL] ${err?.response?.data?.message ?? err.message}`);
    }
}

async function bootstrap() {
    console.log("Setting up users...");

    for (const user of USERS) {
        await signup(user.username, user.password);
    }

    for (const user of USERS) {
        const token = await login(user.username, user.password);
        tokens.push(token);
    }

    console.log(`Tokens loaded: ${tokens.length}`);
    console.log("Starting order flood — 10 orders/sec...\n");

    setInterval(async () => {
        const promises = Array.from({ length:10}, () => {
            const token = tokens[Math.floor(Math.random() * tokens.length)]!;
            return placeOrder(token);
        });
        await Promise.all(promises);
    }, 1000);
}

bootstrap();