/* eslint-disable prettier/prettier */
import { useState } from "react";
import { ipfs } from "../helpers/ipfs";
import { Input } from "antd";
import tokenABI from "../contracts/ABI/CommunityBankingToken.json";

const { ethers } = require("ethers");
const { TextArea } = Input;

function Membership({
    address,
    tx,
    readContracts,
    writeContracts,
  }) {

  const [application, setApplication] = useState("");
  const tokenAddress = readContracts && readContracts.CommunityBankingToken ? readContracts.CommunityBankingToken.address : null;
  const tokenInterface = new ethers.utils.Interface(tokenABI);
  const callData = address && tokenInterface.encodeFunctionData("safeMint", [address])

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
        <ul style={{ listStyleType: "none"}}>
        <li>
          <TextArea
            style={{width: '90%'}}
            rows={12}
            onChange={e => {
              setApplication(e.target.value);
          }}
        />
        </li>
        <li>
        <button type="Submit"
                style={{marginTop: '1%'}}>
                  Submit
         </button>
        </li>
        </ul>
      </form>
    </div>
  );
}

export default Membership;
