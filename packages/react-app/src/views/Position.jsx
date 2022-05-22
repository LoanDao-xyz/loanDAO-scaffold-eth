import { List, Form, Input, Button, Descriptions, Typography } from "antd";
import { useContractReader } from "eth-hooks";
import { useState, useEffect } from "react";

const { Title } = Typography;
const { ethers } = require("ethers");

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

function Position({ address, tx, readContracts, writeContracts }) {
  const [cashflowsState, setCashflowsState] = useState([]);

  const cashflows = useContractReader(readContracts, "CommunityBankingPool", "cashflows", [address]);

  useEffect(() => {
    if (cashflows?.length) {
      const [ids, params] = cashflows;
      const arr = [];
      for (let i = 0; i < ids.length; i++) {
        if(params[i].cfType == 0) {
            const cfId = ids[i].toString();
            const amount = ethers.utils.formatEther(params[i].amount.toString());
            const cashflow = { cfId, amount };
            arr.push(cashflow);
          }
      }
      setCashflowsState(arr);
    }
  }, [cashflows]);

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

  const withdraw = async cfId => {
    const result = tx(writeContracts.CommunityBankingPool.withdraw(cfId), update => {
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
      <Title>Cashflows on Deposits</Title>
      <List
        bordered
        dataSource={cashflowsState}
        renderItem={({ cfId, amount }) => {
          return (
            <List.Item>
              <Descriptions>
                <Descriptions.Item label="Cashflow Id">{cfId}</Descriptions.Item>
                <Descriptions.Item label="Deposit Amount">{amount}</Descriptions.Item>
              </Descriptions>
              <Button onClick={() => withdraw(cfId)}>Withdraw</Button>
            </List.Item>
          );
        }}
      />
      <Title>Deposit</Title>
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
    </div>
  );
}

export default Position;
