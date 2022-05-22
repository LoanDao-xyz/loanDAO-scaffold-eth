import { Descriptions, Form, Input, Button } from "antd";
import { Address } from "../components";
import { useContractReader } from "eth-hooks";

const { ethers } = require("ethers");
const BigNumber = require('bignumber.js');

const layout = {
  labelCol: {
    span: 8,
  },
  wrapperCol: {
    span: 8,
  },
};
/* eslint-disable no-template-curly-in-string */

const validateMessages = {
  required: "${label} is required!",
};
/* eslint-enable no-template-curly-in-string */

function Position({ address, blockExplorer, tx, readContracts, writeContracts }) {
  const cashflows = useContractReader(readContracts, "CommunityBankingPool", "cashflows", [address]);
  const amount = new BigNumber(cashflows.params[0].amount._hex);
  console.log(amount.toString())

  const deposit = async values => {
    const result = tx(writeContracts.CommunityBankingPool.deposit(values.amount), update => {
      console.log("📡 Transaction Update:", update);
      if (update && (update.status === "confirmed" || update.status === 1)) {
        console.log(" 🍾 Transaction " + update.hash + " finished!");
        console.log(
          " ⛽️ " +
            update.gasUsed +
            "/" +
            (update.gasLimit || update.gas) +
            " @ " +
            parseFloat(update.gasPrice) / 1000000000 +
            " gwei",
        );
      }
    });
    console.log("awaiting metamask/web3 confirm result...", result);
    console.log(await result);
  };

  const withdraw = async values => {
    const result = tx(writeContracts.CommunityBankingPool.withdraw(values.cfId), update => {
      console.log("📡 Transaction Update:", update);
      if (update && (update.status === "confirmed" || update.status === 1)) {
        console.log(" 🍾 Transaction " + update.hash + " finished!");
        console.log(
          " ⛽️ " +
            update.gasUsed +
            "/" +
            (update.gasLimit || update.gas) +
            " @ " +
            parseFloat(update.gasPrice) / 1000000000 +
            " gwei",
        );
      }
    });
    console.log("awaiting metamask/web3 confirm result...", result);
    console.log(await result);
  };

  return (
    <div>
      <Descriptions title="User Info">
        <Descriptions.Item label="Address">
          <Address address={address} blockExplorer={blockExplorer} fontSize={20} />
        </Descriptions.Item>
        <Descriptions.Item label="Positions"></Descriptions.Item>
      </Descriptions>

      <Form {...layout} name="deposit" onFinish={deposit} validateMessages={validateMessages}>
        <Form.Item
          name={["amount"]}
          label="Amount"
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item wrapperCol={{ ...layout.wrapperCol, offset: 8 }}>
          <Button type="primary" htmlType="submit">
            Deposit
          </Button>
        </Form.Item>
      </Form>

      <Form {...layout} name="withdraw" onFinish={withdraw} validateMessages={validateMessages}>
        <Form.Item
          name={["cfId"]}
          label="CFID of stream to withdraw"
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item wrapperCol={{ ...layout.wrapperCol, offset: 8 }}>
          <Button type="primary" htmlType="submit">
            Withdraw
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}

export default Position;
