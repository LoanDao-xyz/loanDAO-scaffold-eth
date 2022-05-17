import { List } from "antd";
import { useEventListener } from "eth-hooks/events/useEventListener";

/**
  ~ What it does? ~

  Displays a lists of events

  ~ How can I use? ~

  <Events
    contracts={readContracts}
    contractName="YourContract"
    eventName="SetPurpose"
    localProvider={localProvider}
    mainnetProvider={mainnetProvider}
    startBlock={1}
  />
**/

export default function Events({ contracts, contractName, eventName, localProvider, startBlock }) {
  // 📟 Listen for broadcast events
  const events = useEventListener(contracts, contractName, eventName, localProvider, startBlock);

  return (
    <div style={{ width: 600, margin: "auto", marginTop: 32, paddingBottom: 32 }}>
      <h2>Events:</h2>
      <List
        bordered
        dataSource={events}
        renderItem={item => {
          return (
            <List.Item key={item.args[0]}>
              {`Prposal Id: ${item.args[0]} Proposer: ${item.args[1]} start: ${item.args[6]} end: ${item.args[7]} IPFS CID: ${item.args[8]}`}
            </List.Item>
          );
        }}
      />
    </div>
  );
}
