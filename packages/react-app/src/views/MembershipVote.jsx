import { List } from "antd";
import { useEventListener } from "eth-hooks/events/useEventListener";

export default function MembershipVote({ contracts, contractName, eventName, localProvider, startBlock }) {
  // 📟 Listen for broadcast events
  const events = useEventListener(contracts, contractName, eventName, localProvider, startBlock);
  const tokenAddress = contracts && contracts.CommunityBankingToken ? contracts.CommunityBankingToken.address : null;

  async function getProposalState(proposalId) {
    const result = await contracts.CommunityBankingGovernor.state(proposalId);
    console.log(result);
    return result;
  }

  return (
    <div style={{ width: "100%", margin: "auto", marginTop: 32, paddingBottom: 32 }}>
      <h2>Membership Proposals:</h2>
      <List
        bordered
        dataSource={events}
        renderItem={item => {
          return (
            <List.Item key={item.args[0]}>
              <ul style={{ listStyleType: "none", textAlign: "left" }}>
                <li>{`Prposal Id: ${item.args[0]}`}</li>
                <li>{`Proposer: ${item.args[1]}`}</li>
                {item.args[2] == tokenAddress && <li>{`Proposal Type: Membership`}</li>}
                <li>{`Proposal State: ${getProposalState(item.args[0])}`}</li>
              </ul>
            </List.Item>
          );
        }}
      />
    </div>
  );
}
