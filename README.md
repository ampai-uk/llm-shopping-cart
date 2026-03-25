# LLM Shopping Cart — Ocado MCP Server

An MCP (Model Context Protocol) server that lets Claude interact with [Ocado](https://www.ocado.com), the UK online grocery service. Search your order history and add items to your cart via natural language.

## Introduction

Our motivation for this project is to be able to add items to your grocery shopping cart by talking to an AI on your phone. We remember things we need to buy, especially for daily household needs, but cannot recall them when we get to ordering.

We implement our solution for Ocado, a grocery shopping service in the UK. We hope to extend this project to other grocers as well.

We have implemented and tested this solution with Claude. This project provides an MCP server which can be connected to Claude.

Our goal here is to simply add items to the cart on the fly based on your previous orders. For example, if you tell Claude "add eggs and bread to ocado cart", the eggs and bread you typically order on Ocado are added to your cart.

**What this project does NOT do:**
- Scrape shopping sites for latest deals or compare prices
- Help with the checkout process
- Handle transactions of any kind

By simply adding or removing items from the cart, we keep our scope simple and avoid security issues that could arise if we handled transactions.

We do hope in time merchants will offer their own integrations with frontier models and such custom hacks will not be necessary.

This project has been fully vibe coded using Claude Code and Cline (with MiniMax).


## How to Use

### Connecting to Claude

Once you have set up the MCP server following the installation steps below, you can set it up as a connection in Claude.

You have the option to set up the server with OAuth Client and Secret Keys or without authentication. We personally use it without authentication as our URL is not likely to be discovered — and even if it were, it only gives access to our shopping cart and past orders, with no ability to place orders.

**To set up the connection in Claude:**

1. Go to Claude Settings > Integrations
2. Click "Add Integration" and select "MCP Server"
3. Enter the URL of your deployed MCP server

For authentication, you can either:
- **Without auth:** Simply use the server URL directly
- **With auth:** Configure OAuth Client ID and Client Secret in the connection settings

### Getting Started

Once connected, have the server fetch your latest orders. Do this by typing or saying something like:

> "Update ocado orders"

Updated orders are needed to match items you want to add to the shopping cart. When adding items to the cart, they are matched against your past orders — not Ocado's full inventory. The idea is this is not a discovery service; we just want to quickly add items to cart that we think of.

### Adding Items

To add items to the cart, say or type something like:

> "Add beans, eggs and milk to ocado cart"

This will match items against your order history, add them to your cart, and give you a summary of what is currently in your cart.

### Removing Items

You can also remove items from your cart:

> "Remove milk from ocado cart"

## How to Setup

To make it easier to install for a relatively non-technical person, we have set up a script you can give to Claude Code to do the setup. Unfortunately, this is not completely non-technical and there are some manual steps. You will need to log in to Ocado. You will also need to log in to (or create) an account on Google Cloud Console and associate billing with your account.

To do the setup, issue the following prompt in Claude Code and follow the steps:

```
Fetch https://github.com/ampai-uk/llm-shopping-cart/blob/main/SETUP.md and follow the instructions in it.
```

This will:
- Agree to terms, license, etc.
- Download git and source code of this project
- Install all dependencies
- Start a web session for you to log in to Ocado (username and password are not saved — cookies from your login are saved)
- Set up a project on Google Cloud and deploy the MCP server (your cookies are uploaded to your MCP server so it can act on your behalf)
- Share the MCP server URL that you can use to connect Ocado to Claude


## License

This project is shared under the **MIT License**. Please review the license here:
https://github.com/ampai-uk/llm-shopping-cart/blob/main/LICENSE

## Usage Disclaimer

This tool connects to third-party shopping websites using custom external connectors. Please note:
- It is **your responsibility** to review whether the terms of service or policies of the shopping websites you connect to permit the use of custom external connectors.
- You use this tool **at your own risk**. The authors of this code are **not liable** for how you use it or for any consequences arising from its use.

## Contributions

This project has been contributed by [Amp AI](https://ampai.co.uk), a London based AI consultancy. 