[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=square)](https://github.com/prettier/prettier) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)


# How to get tokens
### Download wallet 
- Download wallet [Metamask](https://metamask.io/) and create account(add address).

### Add test Ether 

- Open Metamask and select test network Ropsten ;
- Follow to [fauscet](https://faucet.dimensions.network/) and claim test ETH.

### Mint LACE Token 

Open [LACE token](https://rinkeby.etherscan.io/address/0x3d3f4724BFa7B13e0ee16BcAd2F49170FDf36e4C) contract on Rinkeby Etherscan:
- click on tab `Contract` then `Write Contract`;
- click on button `Connect to Web3` and connect your wallet;
- select functions `mintArbitrary`:
    - in `_to (address)` pass your **address**;
    - in `_amount (uint256)` pass **amount** of tokens you want to mint (you can't mint more than 1 mil BMI);
    - click buttom `Write` and confirm sending transaction on Metamask;
- add LACE token to Metamask wallet:
    - open Metamask and click `Add Token` in tab **Assets**;
    - switch to tab `Custom Tokens` and paste address of LACE token _00x3d3f4724BFa7B13e0ee16BcAd2F49170FDf36e4C_, save changes;
> **Note:** Amount should be in WEI.
Eg. To mint 100 LACE token you should pass 100 * 10^18 == 100000000000000000000.

### Mint LP Token