const axios = require('axios');

// Додали created_time та last_refresh_time у запит
const GRAPHQL_QUERY = `query ListingSearchQuery(
  $searchParameters: [SearchParameter!] = []
) {
  clientCompatibleListings(searchParameters: $searchParameters) {
    __typename
    ... on ListingSuccess {
      data {
        id
        title
        url
        created_time
        last_refresh_time
        params {
          key
          value {
            __typename
            ... on PriceParam {
              label
              value
              currency
            }
          }
        }
      }
    }
  }
}`;

async function fetchOlxAds(keyword) {
    try {
        const response = await axios.post('https://www.olx.ua/apigateway/graphql', {
            query: GRAPHQL_QUERY,
            variables: {
                searchParameters: [
                    { key: "offset", value: "0" },
                    { key: "limit", value: "10" },
                    { key: "query", value: keyword },
                    { key: "sort_by", value: "created_at:desc" }
                ]
            }
        }, {
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'sec-ch-ua-platform': '"Windows"'
            }
        });

        if (response.data.errors) return [];
        if (!response.data.data || !response.data.data.clientCompatibleListings) return [];

        const rawAds = response.data.data.clientCompatibleListings.data;
        const ads = [];

        if (!rawAds) return [];

        for (const item of rawAds) {
            const priceParam = item.params.find(p => p.key === 'price');
            let itemPrice = 'Ціну не вказано';
            
            if (priceParam && priceParam.value) {
                itemPrice = priceParam.value.label || `${priceParam.value.value} ${priceParam.value.currency}`;
            }

            // ВИЗНАЧАЄМО ВІК ОГОЛОШЕННЯ
            const adDateStr = item.last_refresh_time || item.created_time;
            const adDate = new Date(adDateStr);
            const now = new Date();
            const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; 
            const isOld = (now - adDate) > MAX_AGE_MS;

            ads.push({
                id: item.id.toString(),
                title: item.title,
                price: itemPrice,
                link: item.url,
                isOld: isOld // Передаємо цей статус в index.js
            });
        }

        return ads;

    } catch (error) {
        console.error(`❌ Помилка API:`, error.message);
        return [];
    }
}

module.exports = { fetchOlxAds };