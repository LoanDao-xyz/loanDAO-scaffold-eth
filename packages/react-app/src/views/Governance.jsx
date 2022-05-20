import { useEffect, useState } from "react";
import { List, Layout, Slider } from "antd";
import { useEventListener } from "eth-hooks/events/useEventListener";
import { getFromIPFS, getObjectFromIPFS } from '../helpers/ipfs';
import { Button } from "antd";

const { Content } = Layout;

export default function Governance({tx, writeContracts, readContracts, contractName, eventName, localProvider, startBlock }) {
  const [eventsWithState, setEventsWithState] = useState([]);
  // 📟 Listen for broadcast events
  const events = useEventListener(readContracts, contractName, eventName, localProvider, startBlock);
  const tokenAddress = readContracts && readContracts.CommunityBankingToken ? readContracts.CommunityBankingToken.address : null;
  const poolAddress = readContracts && readContracts.CommunityBankingPool ? readContracts.CommunityBankingPool.address : null;

  useEffect(async function() {
    if (events?.length) {
      const res = await Promise.all(events.map(async event => {
        const stateCode = await readContracts.CommunityBankingGovernor.state(event.args[0]);
        let state;
        switch(stateCode) {
            case 0: 
                state = 'Pending';
                break;
            case 1: 
                state = 'Active';
                break;
            case 2:
                state = 'Canceled';
                break;
            case 3:
                state = 'Defeated';
                break;
            case 4: 
                state = 'Succeeded';
                break;
            case 5: 
                state = 'Queued';
                break;
            case 6:
                state = 'Expired';
                break;
            case 7:
                state = 'Executed';
                break;
            default:
        }
        const ipfs = event.args[2] == tokenAddress && await getFromIPFS(event.args[8]);
        const ipfsObject = event.args[2] == poolAddress && await getObjectFromIPFS(event.args[8]);

        return { event, state, ipfs, ipfsObject };
      }));

      setEventsWithState(res)
    }
  }, [events, readContracts]);

  async function castVote(proposalId, support) {
    const result = tx(writeContracts.CommunityBankingGovernor.castVote(
        proposalId,
        support,
        ));
      console.log("awaiting metamask/web3 confirm result...", result);
      console.log(await result);
  } 

  return (
    <div style={{ width: "100%", margin: "auto", marginTop: 32, paddingBottom: 32 }}>
          <h2>Proposals:</h2>
          <List
            bordered
            dataSource={eventsWithState}
            renderItem={({ event, state, ipfs, ipfsObject }) => {
              return (
                <List.Item key={event.args[0]}>
                  <ul style={{ listStyleType: "none", textAlign: "left" }}>
                    <li>{`Prposal Id: ${event.args[0]}`}</li>
                    <li>{`Proposer: ${event.args[1]}`}</li>
                    {event.args[2] == tokenAddress && <li>{`Proposal Type: Membership`}</li>}
                    {event.args[2] == poolAddress && <li>{`Proposal Type: Loan`}</li>}
                    <li>{`Proposal State: ${state}`}</li>
                    {event.args[2] == tokenAddress && <li>{`Application: ${ipfs}`}</li>}
                    {event.args[2] == poolAddress && <li>{`Amount: ${ipfsObject.loan.amount}`}</li>}
                    {event.args[2] == poolAddress && <li>{`Loan Justification: ${ipfsObject.loan.description}`}</li>}
                    {state && state == 'Active' &&
                      <div>
                              <Button onClick={() => castVote(event.args[0], 1)}>Yea</Button>
                              <Button onClick={() => castVote(event.args[0], 0)}>Nay</Button>
                              <Button onClick={() => castVote(event.args[0], 2)}>Abstain</Button>
                      </div>
                    }
                  </ul>
                </List.Item>
              );
            }}
          />
    </div>
  );
}
