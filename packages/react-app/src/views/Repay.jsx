import { List, Button, Descriptions, Typography } from "antd";
import { useContractReader } from "eth-hooks";
import { useState, useEffect } from "react";

const { Title } = Typography;
const { ethers } = require("ethers");

function Repay({ address, tx, readContracts, writeContracts }) {
  const [cashflowsState, setCashflowsState] = useState([]);

  const cashflows = useContractReader(readContracts, "CommunityBankingPool", "cashflows", [address]);

  useEffect(() => {
    if (cashflows?.length) {
      const [ids, params] = cashflows;
      const arr = [];
      for (let i = 0; i < ids.length; i++) {
        if (params[i].cfType == 1) {
          const cfId = ids[i].toString();
          const amount = ethers.utils.formatEther(params[i].amount.toString());
          const cashflow = { cfId, amount };
          arr.push(cashflow);
        }
      }
      setCashflowsState(arr);
    }
  }, [cashflows]);

  const repay = async cfId => {
    const result = tx(writeContracts.CommunityBankingPool.repay(cfId), update => {
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
      <Title>Cashflows on Loans</Title>
      <List
        bordered
        dataSource={cashflowsState}
        renderItem={({ cfId, amount }) => {
          return (
            <List.Item>
              <Descriptions>
                <Descriptions.Item label="Cashflow Id">{cfId}</Descriptions.Item>
                <Descriptions.Item label="Loan Amount">{amount}</Descriptions.Item>
              </Descriptions>
              <Button onClick={() => repay(cfId)}>Repay</Button>
            </List.Item>
          );
        }}
      />
    </div>
  );
}

export default Repay;
