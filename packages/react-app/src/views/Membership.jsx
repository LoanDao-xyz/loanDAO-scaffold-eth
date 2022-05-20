/* eslint-disable prettier/prettier */
import { useState } from "react";
import { ipfs } from "../helpers/ipfs";
import { Form, Input, Button, Typography } from 'antd';
import tokenABI from "../contracts/ABI/CommunityBankingToken.json";

const { ethers } = require("ethers");
const { Title } = Typography;

const validateMessages = {
  required: '${label} is required!',
};

const layout = {
  labelCol: {
    span: 8,
  },
  wrapperCol: {
    span: 8,
  },
};

function Membership({
    address,
    tx,
    readContracts,
    writeContracts,
  }) {

  const tokenAddress = readContracts && readContracts.CommunityBankingToken ? readContracts.CommunityBankingToken.address : null;
  const tokenInterface = new ethers.utils.Interface(tokenABI);
  const callData = address && tokenInterface.encodeFunctionData("safeMint", [address])

  async function onFinish(values) {
    const {path}  = await ipfs.add(values.application);
    
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
      <Title>Apply for a Membership:</Title>
      <Form {...layout} name="membership-application" onFinish={onFinish} validateMessages={validateMessages}>
        <Form.Item 
          name={['application']} 
          label="Please describe why you want to join the DAO and why you can be trusted to repay loans:"
          rules={[
            {
              required: true,
            },
          ]}
          >
          <Input.TextArea />
        </Form.Item>
        <Form.Item wrapperCol={{ ...layout.wrapperCol, offset: 8 }}>
          <Button type="primary" htmlType="submit">
            Submit
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}

export default Membership;
