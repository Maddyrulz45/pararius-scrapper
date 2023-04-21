require('dotenv').config();
const { writeFileSync, readFileSync } = require('fs');
const puppeteer = require('puppeteer');
const jsdom = require('jsdom');
const nodeFetch = require('node-fetch');
const { getZipCode, getNeighbourhoodData, convertResidentsToPercentage} = require('./utils/utils');

const WIDTH = 1920;
const HEIGHT = 1080;

const data = readFileSync('db.json', { encoding:'utf8', flag: 'r' });
const pastResults = new Set(JSON.parse(data) || []);
console.log('pastResults:', pastResults);
const newResults = new Set();
const houses = [];
const { CHAT_ID, BOT_API } = process.env;

const parariusURL  = [
    'https://www.pararius.com/apartments/utrecht/200-1500/since-1'
];

const runTaskforPararius = async () => {
    for (const url of parariusURL ) {
        await runPuppeteerforPararius(url);
    }

    console.log('newResults:', newResults);

    if (newResults.size > 0) {
        writeFileSync('db.json', JSON.stringify(Array.from([
            ...newResults,
            ...pastResults,
        ])));

        console.log('sending messages to Telegram');
        const date = (new Date()).toISOString().split('T')[0];
        houses.forEach(({
            path,
            subtitleText,
            zipCode
        }) => {
            let text = `New house on ${date}: [click here](${path})`;
            text = `${text}\n${subtitleText}\n${zipCode}`;


            nodeFetch(`https://api.telegram.org/bot${BOT_API}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    chat_id : CHAT_ID,
                    parse_mode : 'markdown',
                }),
            });
        });
    }
};

const runPuppeteerforPararius = async (url) => {
    console.log('opening headless browser');
    const browser = await puppeteer.launch({
        headless: true,
        args: [`--window-size=${WIDTH},${HEIGHT}`],
        defaultViewport: {
            width: WIDTH,
            height: HEIGHT,
        },
    });

    const page = await browser.newPage();
    // https://stackoverflow.com/a/51732046/4307769 https://stackoverflow.com/a/68780400/4307769
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36');

    console.log('going to Pararius');
    console.log(url)
    //await page.goto(url, {'timeout': 10000, 'waitUntil':'load'});
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    //await page.waitForSelector('.search-list');
  
    const htmlString = await page.content();
    const virtualConsole = new jsdom.VirtualConsole();
    const dom = new jsdom.JSDOM (htmlString, {virtualConsole});

    console.log("htmlString:"+htmlString)

    console.log('parsing pararius.nl data');
    
    // set the length to 0
    houses.length = 0;
    const result = dom.window.document.querySelectorAll('.search-list');// add the result set class
    
    for (const element of result) {
        const urlPath = element?.querySelectorAll('a')?.[0]?.href;
        const headerSubtitle = element?.querySelector('.listing-search-item__link--title'); //listing-search-item__title
        const subtitleText = headerSubtitle?.innerHTML?.trim();

        let path = urlPath;
        if (!path.includes('https://www.pararius.com')) { // add new site url
            path = `https://www.pararius.com${urlPath}`;
        }

        path = path.replace('?navigateSource=resultlist', '');
        if (path && !pastResults.has(path) && !newResults.has(path)) {
            let extraDetails = {};
            const zipCode = getZipCode(subtitleText || '');

            newResults.add(path);
            
            houses.push({
                subtitleText,
                zipCode,
                path,
            });
        }
    }

    console.log('closing browser');
    await browser.close();
};

if (CHAT_ID && BOT_API) {
    runTaskforPararius();
} else {
    console.log('Missing Telegram API keys!');
}
