/* global $ */
const parsePrice = require('parse-price');
const queryString = require('query-string');
const parseUrl = require('url-parse');
const { getCurrency } = require('./utils.js');

function extractDetails($, request) {
    const h1 = $('h1');
    const reviews = $('#acrCustomerReviewText');
    const questions = $('#askATFLink span');
    const avgRating = $('#averageCustomerReviews i span');
    const bsrRe = new RegExp('#(.{0,3}) in', 'ig');
    const bsrEl = $('#SalesRank');
    const bsr = bsrEl.length && bsrRe.exec(bsrEl.text());

    return {
        title: h1.length !== 0 ? h1.text().trim() : null,
        reviews: reviews.length && reviews.text().split(' ')[0],
        answeredQuestions: questions.length && questions.text().split(' ')[0],
        avgRating: avgRating.length && avgRating.text().split(' ')[0],
        bsr: bsr && bsr[1],
        url: request.url,
        asin: request.userData.asin
    };
}

function buildSellerUrl(url) {
    const parsedUrl = queryString.parseUrl(url);
    return `${parsedUrl.url}/?seller=${parsedUrl.query.seller}`;
}

function extractSellers($, request) {
    const sellers = [];
    const hostName = parseUrl(request.url).hostname;
    $('div.olpOffer').each(function () {
        const priceElem = $(this).find('span.olpOfferPrice');
        const sellerNameEle = $(this).find('h3.olpSellerName img');
        let price; let
            priceParsed = null;
        if (priceElem.length !== 0) {
            price = priceElem.text().trim().replace('Rs.', 'Rs');
            priceParsed = parsePrice(price);
        } else {
            price = 'price not displayed';
        }
        let shippingInfo;
        let condition;
        const sellerName = sellerNameEle.length !== 0 ? sellerNameEle.attr('alt') : $(this).find('h3.olpSellerName').text().trim();
        const sellerShopUrl = sellerNameEle.length !== 0 ? hostName : ($(this).find('h3.olpSellerName a').length !== 0 ? buildSellerUrl(`${hostName}${$(this).find('h3.olpSellerName a').attr('href')}`) : null);

        let prime = false;
        if ($(this).find("a:contains('Fulfillment by Amazon')").length !== 0) {
            prime = true;
        } else if ($(this).find('i.a-icon-prime').length !== 0) {
            prime = true;
        } else if (sellerName === 'Amazon.com') {
            prime = true;
        }
        const offerConditionEle = $(this).find('div#offerCondition');
        const olpConditionEle = $(this).find('span.olpCondition');

        if (offerConditionEle.length !== 0) {
            condition = offerConditionEle.text().replace(/\s\s+/g, ' ').trim();
        } else if (olpConditionEle.length !== 0) {
            condition = olpConditionEle.text().replace(/\s\s+/g, ' ').trim();
        } else {
            condition = 'condition unknown';
        }

        const olpShippingInfoEle = $(this).find('p.olpShippingInfo ');
        if (olpShippingInfoEle.length !== 0) {
            shippingInfo = olpShippingInfoEle.text().replace(/\s\s+/g, ' ').trim();
        } else if ($("div.olpPriceColumn:contains('FREE Shipping')").length !== 0) {
            shippingInfo = '& eligible for FREE Shipping';
        } else {
            shippingInfo = 'shipping info not included';
        }

        sellers.push({
            price,
            priceParsed,
            condition,
            sellerName,
            prime,
            shippingInfo,
            shopUrl: sellerShopUrl,
        });
    });
    return sellers;
}


// to in a way to make sense what they are doing, so this one should be
// called parseSellerDetails
async function parseSellerDetails($, request) {
    const sellers = await extractSellers($, request);
    const item = await extractInfo($);
    const currency = await getCurrency(request);

    if (request.userData.sellers) {
        item.sellers = request.userData.sellers.concat(sellers);
    } else {
        item.sellers = sellers;
    }
    const { keyword, asin, detailUrl, sellerUrl, country } = request.userData;
    item.keyword = keyword;
    item.asin = asin;
    item.itemDetailUrl = detailUrl;
    item.sellerOffersUrl = sellerUrl;
    item.country = country;
    item.currency = currency;
    if (item.title === null) {
        item.status = 'This ASIN is not available for this country.';
    }
    return item;
}

module.exports = extractDetails;
