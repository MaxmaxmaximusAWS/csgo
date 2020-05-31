import { useQuery, useSubscription } from "@apollo/react-hooks"
import gql from "graphql-tag"


export default function useLiveQuery(query, options = {}) {
  if (!process.browser) {
    return useQuery(query, options)
  }

  return useLiveQueryBrowser(query, options)
}


const subscriptionsMap = new WeakMap()

function useLiveQueryBrowser(query, options) {
  if (!subscriptionsMap.has(query)) {
    subscriptionsMap.set(query, createSubscription(query))
  }

  const subscription = subscriptionsMap.get(query)

  const queryResult = useQuery(query, options)

  useSubscription(subscription, {
    onSubscriptionData({client, subscriptionData: {data}}) {
      client.writeQuery({
        query, data,
        variables: options.variables
      })
    }
  })

  return queryResult
}


function createSubscription(query) {
  let subscription = JSON.parse(JSON.stringify(query))
  subscription.definitions[0].operation = 'subscription'
  return subscription
}