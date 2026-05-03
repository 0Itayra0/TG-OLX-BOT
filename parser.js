const axios = require('axios');

// Тепер шапка запиту чиста, вимагає лише searchParameters
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
                // Видалили зайві змінні звідси також
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

        if (response.data.errors) {
            console.error(`❌ GraphQL лається на слово "${keyword}":`, JSON.stringify(response.data.errors, null, 2));
            return [];
        }

        if (!response.data.data || !response.data.data.clientCompatibleListings) {
            console.error(`🚨 Неочікувана відповідь від OLX для "${keyword}":`, JSON.stringify(response.data, null, 2));
            return [];
        }

        const rawAds = response.data.data.clientCompatibleListings.data;
        const ads = [];

        if (!rawAds) return [];

        for (const item of rawAds) {
            const priceParam = item.params.find(p => p.key === 'price');
            let itemPrice = 'Ціну не вказано';
            
            if (priceParam && priceParam.value) {
                itemPrice = priceParam.value.label || `${priceParam.value.value} ${priceParam.value.currency}`;
            }

            ads.push({
                id: item.id.toString(),
                title: item.title,
                price: itemPrice,
                link: item.url
            });
        }

        return ads;

    } catch (error) {
        console.error(`❌ Помилка API для слова "${keyword}":`, error.response ? error.response.status : error.message);
        return [];
    }
}

module.exports = { fetchOlxAds };