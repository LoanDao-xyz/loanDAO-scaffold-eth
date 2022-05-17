import { useEffect, useState } from "react";
import { List } from "antd";
import { useEventListener } from "eth-hooks/events/useEventListener";

export default function MembershipVote({ contracts, contractName, eventName, localProvider, startBlock }) {
  const [eventsWithState, setEventsWithState] = useState([]);
  // 📟 Listen for broadcast events
  const events = useEventListener(contracts, contractName, eventName, localProvider, startBlock);
  const tokenAddress = contracts && contracts.CommunityBankingToken ? contracts.CommunityBankingToken.address : null;

  useEffect(async function() {
    if (events?.length) {
      const res = await Promise.all(events.map(async event => {
        const state = await contracts.CommunityBankingGovernor.state(event.args[0]);
        return { event, state };
      }));

      setEventsWithState(res)
    }
  }, [events, contracts]);

  return (
    <div style={{ width: "100%", margin: "auto", marginTop: 32, paddingBottom: 32 }}>
      <h2>Membership Proposals:</h2>
      <List
        bordered
        dataSource={eventsWithState}
        renderItem={({ event, state }) => {
          return (
            <List.Item key={event.args[0]}>
              <ul style={{ listStyleType: "none", textAlign: "left" }}>
                <li>{`Prposal Id: ${event.args[0]}`}</li>
                <li>{`Proposer: ${event.args[1]}`}</li>
                {event.args[2] == tokenAddress && <li>{`Proposal Type: Membership`}</li>}
                <li>{`Proposal State: ${state}`}</li>
              </ul>
            </List.Item>
          );
        }}
      />
    </div>
  );
}
