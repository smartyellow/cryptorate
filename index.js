'use strict';

const { coins, icons: coinIcons, colours } = require('./coins');

const rates = {};
const coinIds = Object.keys(coins);
const icons = {
  crypto: '<g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-width="48" d="M384 704c176.73 0 320-143.27 320-320S560.73 64 384 64 64 207.27 64 384s143.27 320 320 320Zm0 0"/><path stroke-width="48" d="M480 272c-21.922-21.918-60.523-37.168-96-38.121M288 480c20.625 27.496 58.969 43.18 96 44.512m0-290.633c-42.21-1.137-80 17.96-80 70.121 0 96 176 48 176 144 0 54.754-46.84 78.277-96 76.512m0-290.633V176m0 348.512V592"/></g>',
};
let apiUrl = 'https://pro-api.coinmarketcap.com';
let error = false;

module.exports = {

  // Friendly name
  name: 'Crypto coin exchange rate',

  // Brief description of this plugin
  purpose: 'Widget that shows the actual exchange rate of various crypto coins',

  // Version of this plugin
  version: '2.1.0',

  // Name of the plugin author
  author: 'Romein van Buren',

  // Name of vendor of this plugin
  vendor: 'Smart Yellow',

  // Array of plugins this plugin depends on
  requires: [ ],

  icon: icons.crypto,

  settings: {
    apikey: {
      type: 'string',
      label: 'CoinMarketCap API key',
      default: '',
    },
    coins: {
      type: 'multiselect',
      label: 'Enabled coins',
      description: 'Coins from which the value will be fetched.',
      options: coinIds,
      default: [ 'btc', 'eth', 'doge' ],
    },
    interval: {
      type: 'number',
      label: 'Refresh interval in minutes',
      default: 10,
    },
    sandbox: {
      type: 'boolean',
      label: 'Use sandbox API for testing',
      description: 'This contains fake data but won\'t charge your API key.',
      default: false,
    },
  },

  init: async ({ server, settings }) => {
    if ((!settings.apikey || settings.apikey === '') && !settings.sandbox) {
      server.error('CoinMarketCap API key is unset. Please enter one in the cryptorate plugin settings.');
    }

    if (settings.sandbox) {
      apiUrl = 'https://sandbox-api.coinmarketcap.com';
      settings.apikey = 'b54bcf4d-1bca-4e8e-9a24-22ff2c3d462c';
      server.warn('cryptorate: using sandbox API that only serves fake data');
    }

    if (!Array.isArray(settings.coins)) {
      server.error('cryptorate: setting `coins` must be an array.');
      error = 'Setting `coins` must be an array.';
    }

    settings.coins.forEach(coin => {
      if (!coinIds.includes(coin)) {
        server.warn(`cryptorate: unknown coin identifier in plugin settings: ${coin}. It will be ignored.`);
        const invalidIndex = settings.coins.indexOf(coin);
        settings.coins.splice(invalidIndex, 1);
      }
    });

    coinIds.forEach(c => rates[c] = []);

    let usageInfo;
    try {
      usageInfo = await server.get(apiUrl + '/v1/key/info', {
        'X-CMC_PRO_API_KEY': settings.apikey,
      });
    }
    catch (err) {
      server.error(err);
      server.error('cryptorate: encountered an error while trying to connect to CoinMarketCap API. Please make sure to set a valid API key in the cryptorate plugin settings.');
      error = 'Encountered an error while trying to connect to CoinMarketCap API. Please make sure to set a valid API key in the cryptorate plugin settings.';
    }

    if (!settings.sandbox && !error && Object.keys(usageInfo)) {
      const leftToday = usageInfo.data.usage.current_day.credits_left;
      const leftMonth = usageInfo.data.usage.current_month.credits_left;
      const refreshedDay =  1440 / settings.interval;
      const refreshedMonth = refreshedDay * 30;
      const eachTime = (settings.coins.length / 100) + 1;
      const eachDay = 1440 / settings.interval;
      const eachMonth = eachDay * 30;

      server.info('');
      server.info('CoinMarketCap API usage information:');
      server.info(`- credits left today:                           ${leftToday}`);
      server.info(`- credits left this month:                      ${leftMonth}`);
      server.info(`- credits used each time the data is refreshed: ${eachTime}`);
      server.info(`- credits used each day:                        ${eachDay}`);
      server.info(`- credits used each month:                      ${eachMonth}`);
      server.info(`- times refreshed each day:                     ${refreshedDay}`);
      server.info(`- times refreshed each month:                   ${refreshedMonth}`);
      server.info('');
    }

    return true;
  },

  gui: {
    widgets: () => [
      {
        path: 'rate.svelte',
        title: 'Crypto coin exchange rates',
        purpose: 'Shows the live crypto coin exchange rate.',
        defaults: {
          title: 'Crypto coin rate',
          coin: 'btc',
          decimals: 2,
        },
      },
    ],
  },

  routes: ({ settings }) => [
    { route: '/cryptorate',
      method: 'get',
      handler: (req, res) => {
        if (!error) {
          const selectedCoins = {};
          settings.coins.forEach(coin => {
            selectedCoins[coin] = coins[coin];
          });
          res.json({
            allCoins: coins,
            selectedCoins,
            icons: coinIcons,
            colours,
          });
        }
        else {
          res.json({ error });
        }
      },
    },

    { route: '/cryptorate/:coinid',
      method: 'get',
      handler: (req, res) => {
        if (!error) {
          const [ param ] = req.params;
          if (!coinIds.includes(param)) {
            res.error(404, 'no such coin exists');
          }
          res.json({
            name: coins[param],
            rates: rates[param],
            icon: coinIcons[param],
            colour: colours[param],
          });
        }
        else {
          res.json({ error });
        }
      },
    },

    { route: '/cryptorate/settings',
      method: 'get',
      handler: (req, res) => {
        if (!error) {
          const s = JSON.parse(JSON.stringify(settings));
          delete s.apikey;
          delete s.widgets;
          res.json(s);
        }
        else {
          res.json({ error });
        }
      },
    },
  ],

  jobs: ({ server, settings }) => [
    { id: 'getrates',
      purpose: 'Pre-caches crypto currency rates on the server',
      mandatory: true,
      runAtBoot: true,
      active: true,
      interval: Number(settings.interval) * 60 * 1000,
      action: async function () {
        if (!error) {
          try {
            const param = settings.coins.map(c => c.toUpperCase()).join(',');
            const data = await server.get(`${apiUrl}/v2/cryptocurrency/quotes/latest?symbol=${param}&convert=EUR`, {
              'X-CMC_PRO_API_KEY': settings.apikey,
            });

            settings.coins.forEach(coin => {
              const quote = data.data[coin.toUpperCase()][0].quote.EUR;
              const currentCoinData = {
                date: new Date(),
                price: quote.price,
                change1h: quote.percent_change_1h,
                change24h: quote.percent_change_24h,
                change7d: quote.percent_change_7d,
                change30d: quote.percent_change_30,
              };
              if (rates[coin].length === 0) {
                rates[coin] = Array(10).fill(currentCoinData);
              }
              else {
                rates[coin].push(currentCoinData);
                rates[coin].shift();
              }
            });
          }
          catch (err) {
            server.error(err);
            server.error('cryptorate: could not load coin data');
          }
        }
      },
    },
  ],

  extensions: ({ server }) => ({
    getCryptoRateData: coinId => {
      if (!error) {
        if (!coinId || coinId === '') {
          return rates;
        }
        if (!coinIds.includes(coinId)) {
          server.error(`getCryptoRateData: ${coinId} is not a valid coin identifier`);
        }
        return rates[coinId];
      }
      else {
        server.error(`getCryptoRateData: could not load rate data because of a configuration error: ${error}`);
      }
    },
  }),

};
