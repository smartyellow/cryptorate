<script>

import { onMount } from 'svelte';
import { translate, prefix } from 'helpers/webdesq/stores.js';
import { coins } from '../../coins.js';
import Chart from 'components/smartyellow/chart.svelte';

export let widget = {};
export let language = 'en';
export const settings = {
  title: {
    type: 'string',
    label: translate('title', language),
  },
  coin: {
    type: 'select',
    options: Object.keys(coins),
    label: translate('crypto currency to display', language),
  },
  decimals: {
    type: 'number',
    label: translate('decimal places', language),
  },
  showchart: {
    type: 'boolean',
    label: translate('show chart?', language),
  }
};

const intervals = ['1h', '24h', '7d'];
let promise = refresh();

async function refresh() {
  const rateRes = await fetch(`${$prefix}/cryptorate/${widget.coin}`);
  const rateData = await rateRes.json();

  const settingsRes = await fetch(`${$prefix}/cryptorate/settings`);
  const settingsData = await settingsRes.json();

  if (rateRes.ok && settingsRes.ok) return {
    ...rateData,
    settings: settingsData
  };
  else throw new Error('Error while fetching coin data');
}

onMount(async () => {
  const interval = setInterval(() => {
    promise = refresh();
  }, 10_000);

  return () => clearInterval(interval);
});

</script>

{#await promise}
  <div class="container">
    <svg viewBox="0 0 786 786">
      <path fill="grey" fill-rule="evenodd" d="M768 384c0 212.078-171.922 384-384 384S0 596.078 0 384 171.922 0 384 0s384 171.922 384 384Zm0 0"></path>
    </svg>
    <div>
      <p class="description">
        {@html translate('Loading coin value...', language)}
      </p>
      <p class="rate">
        € ...
      </p>
      <p class="changelist">
        {#each intervals as interval, index}
          <span class="change">
            <span class="label">{interval}</span>
            <span class="value">... %</span>
          </span>
        {/each}
      </p>
    </div>
  </div>
{:then data}
  {@const last = !data.error ? data.rates[data.rates.length - 1] : false}
  {#if !data.error && last}
    <div class="container">
      <svg viewBox="0 0 786 786">{@html data.icon}</svg>
      <div>
        <p class="description">
          {@html translate('Current value of 1 <m>:', [ `<span>${data.name}</span>`, language ])}
        </p>
        {#if last}
          <p class="rate">
            € {Number(last.price).toFixed(widget.decimals)}
          </p>

          <p class="changelist">
            {#each intervals as interval, index}
              {@const change = Number(last['change' + interval]).toFixed(2)}
              {@const down = change < 0}

              <span class="change">
                <span class="label">{interval}</span>
                <span class="value {down ? 'red' : 'green'}">
                  {down ? '▼' : '▲'}
                  {down ? change * -1 : change}%
                </span>
              </span>
            {/each}
          </p>
        {:else}
          <p class="red">
            {translate('<m> has not yet been activated in the plugin settings. Please activate it to see its rates.', [ data.name, language ])}
          </p>
        {/if}
      </div>
    </div>

    {#if last && widget.showchart}
      <Chart
        type="line"
        height={200}
        showLegend={false}
        beginAtZeroY
        disableAnimation
        data={{
          labels: Array(10).fill('').map((_, i) => data.settings.interval * 10 - data.settings.interval * i  + 'm'),
          datasets: [{
            label: translate('Value of 1 <m>', [ coins[widget.coin], language ]),
            data: data.rates.map(d => d.price),
            fill: false,
            borderColor: data.colour,
          }]
        }}
      />
    {/if}
  {:else}
    <div class="red">
      <p>Server configuration error:</p>
      <p><code>{data.error}</code></p>
    </div>
  {/if}
{:catch error}
  <div class="red">
    <p>{translate('Error while fetching coin data:', language)}</p>
    <p><code>{error}</code></p>
  </div>
{/await}

<style>
  p {
    margin: 0;
  }
  .container {
    display: flex;
    align-items: center;
    margin: 0.5rem;
    gap: 1rem;
  }
  .container > svg {
    height: 60px;
    width: 60px;
  }
  .container > div {
    flex: 1 1;
  }
  .description :global(span) {
    font-weight: 600;
  }
  .rate {
    font-size: 1.5rem;
  }
  .changelist .change:not(:last-of-type)::after {
    content: ' | ';
    opacity: 0.4;
  }
  .green {
    color: #007600;
  }
  .red {
    color: #b00000;
  }
</style>
