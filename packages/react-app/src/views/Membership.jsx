/* eslint-disable prettier/prettier */
import { useState } from "react";
import { ipfs } from "../helpers/ipfs";
import { Input } from "antd";
import tokenABI from "../contracts/ABI/CommunityBankingToken.json";
import { Events } from "../components";

const { ethers } = require("ethers");
const { TextArea } = Input;

function Membership({
    purpose,
    address,
    mainnetProvider,
    localProvider,
    yourLocalBalance,
    price,
    tx,
    readContracts,
    writeContracts,
  }) {

  const [application, setApplication] = useState("");
  const tokenAddress = readContracts && readContracts.CommunityBankingToken ? readContracts.CommunityBankingToken.address : null;
  const governorInterface = new ethers.utils.Interface(tokenABI);
  const callData = address && governorInterface.encodeFunctionData("safeMint", [address])

  async function handleSubmit(e) {
    e.preventDefault()
    const {path}  = await ipfs.add(application);
    
    const result = tx(writeContracts.CommunityBankingGovernor.propose(
        [tokenAddress],
        [0],
        [callData],
        path
        ));
      console.log("awaiting metamask/web3 confirm result...", result);
      console.log(await result);
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <h3>Please describe why you want to join the DAO and why you can be trusted to repay loads:</h3>
        <TextArea
          style={{width: '90%'}}
          rows={12}
          onChange={e => {
            setApplication(e.target.value);
          }}
        />
        <button type="Submit">Submit</button>
      </form>

      <Events
        contracts={readContracts}
        contractName="CommunityBankingGovernor"
        eventName="ProposalCreated"
        localProvider={localProvider}
        startBlock={1}
      />
    </div>
  );
}

export default Membership;
