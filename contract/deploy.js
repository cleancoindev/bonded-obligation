// @ts-check
import fs from 'fs';
import { E } from '@agoric/eventual-send';
import harden from '@agoric/harden';

// This script takes our contract code, installs it on Zoe, and makes
// the installation publicly available. Our backend API script will
// use this installation in a later step.

/**
 * @typedef {Object} DeployPowers The special powers that agoric deploy gives us
 * @property {(path: string) => { moduleFormat: string, source: string }} bundleSource
 * @property {(path: string) => string} pathResolve
 */

const TIP_ISSUER_PETNAME = process.env.TIP_ISSUER_PETNAME || 'moola';

/**
 * 
 * @param {*} referencesPromise
 * @param {DeployPowers} powers
 */
export default async function deployContract(referencesPromise, { bundleSource, pathResolve }) {
  // Your off-chain machine (what we call an ag-solo) starts off with
  // a number of references, some of which are shared objects on chain, and
  // some of which are objects that only exist on your machine.

  // Let's wait for the promise to resolve.
  const references = await referencesPromise;

  // Unpack the references.
  const { 

    // *** ON-CHAIN REFERENCES ***

    // Zoe lives on-chain and is shared by everyone who has access to
    // the chain. In this demo, that's just you, but on our testnet,
    // everyone has access to the same Zoe.
    zoe, 

    // The registry also lives on-chain, and is used to make private
    // objects public to everyone else on-chain. These objects get
    // assigned a unique string key. Given the key, other people can
    // access the object through the registry.
    registry,

    wallet,

  }  = references;

  // First, we must bundle up our contract code (./src/contract.js)
  // and install it on Zoe. This returns an installationHandle, an
  // opaque, unforgeable identifier for our contract code that we can
  // reuse again and again to create new, live contract instances.
  const { source, moduleFormat } = await bundleSource(pathResolve(`./src/contracts/proxy.js`));
  const installationHandle = await E(zoe).install(source, moduleFormat);

  // Let's share this installationHandle with other people, so that
  // they can run our encouragement contract code by making a contract
  // instance (see the api deploy script in this repo to see an
  // example of how to use the installationHandle to make a new contract
  // instance.)
  
  // getIssuers returns an array, because we currently cannot
  // serialize maps. We can immediately create a map using the array,
  // though. https://github.com/Agoric/agoric-sdk/issues/838
  const issuersArray = await E(wallet).getIssuers();
  const issuers = new Map(issuersArray);
  const tipIssuer = issuers.get(TIP_ISSUER_PETNAME);
  const issuerKeywordRecord = harden({ Tip: tipIssuer });
  const adminInvite = await E(zoe).makeInstance(
    installationHandle,
    issuerKeywordRecord,
    { timerService: referencesPromise.timerService });
  
  // To share the installationHandle, we're going to put it in the
  // registry. The registry is a shared, on-chain object that maps
  // strings to objects. We will need to provide a starting name when
  // we register our installationHandle, and the registry will add a
  // suffix creating a guaranteed unique name.
  const CONTRACT_NAME = 'time-release';
  const INSTALLATION_REG_KEY = await E(registry).register(`${CONTRACT_NAME}installation`, installationHandle);
  console.log('- SUCCESS! contract code installed on Zoe');
  console.log(`-- Contract Name: ${CONTRACT_NAME}`);
  console.log(`-- InstallationHandle Register Key: ${INSTALLATION_REG_KEY}`);

  // Save the constants somewhere where the UI and api can find it.
  const dappConstants = {
    CONTRACT_NAME,
    INSTALLATION_REG_KEY,
    // BRIDGE_URL: 'agoric-lookup:https://local.agoric.com?append=/bridge',
    BRIDGE_URL: 'http://127.0.0.1:8000',
    API_URL: 'http://127.0.0.1:8000',
  };
  const defaultsFile = pathResolve(`../ui/public/conf/defaults.js`);
  console.log('writing', defaultsFile);
  const defaultsContents = `\
  // GENERATED FROM ${pathResolve('./deploy.js')}
  export default ${JSON.stringify(dappConstants, undefined, 2)};
  `;
  await fs.promises.writeFile(defaultsFile, defaultsContents);
}
