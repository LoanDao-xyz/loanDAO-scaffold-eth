import { Descriptions } from 'antd';
import { Address } from '../components';

function Position({address, blockExplorer, readContracts}) {
    const deposits = readContracts && readContracts.CommunityBankingPool ? readContracts.CommunityBankingPool.address : null;  

  return (
    <div>
        <Descriptions title="User Info">
            <Descriptions.Item label="Address">
            <Address
                address={address}
                blockExplorer={blockExplorer}
                fontSize={20}
            />
            </Descriptions.Item>
            <Descriptions.Item label="Positions"></Descriptions.Item>
        </Descriptions>
    </div>
  )
}

export default Position;