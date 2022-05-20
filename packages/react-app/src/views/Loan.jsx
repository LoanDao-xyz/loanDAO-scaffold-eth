import { Form, Input, Button, Typography } from 'antd';
import { ipfs } from "../helpers/ipfs";
import poolABI from "../contracts/ABI/CommunityBankingPool.json";

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
  required: '${label} is required!',
};
/* eslint-enable no-template-curly-in-string */

const Loan = ({tx, writeContracts, address}) => {
  const poolAddress = writeContracts && writeContracts.CommunityBankingPool ? writeContracts.CommunityBankingPool.address : null;
  const poolInterface = new ethers.utils.Interface(poolABI);

  const onFinish = async (values) => {
    const json = JSON.stringify(values);
    const {path}  = await ipfs.add(json);
    const callData = address && poolInterface.encodeFunctionData("borrow", [address, values.loan.amount]);
    
    const result = tx(writeContracts.CommunityBankingGovernor.propose(
        [poolAddress],
        [0],
        [callData],
        path
        ));
      console.log("awaiting metamask/web3 confirm result...", result);
      console.log(await result);
  }

  return (
    <div>
      <Title>Apply for a Loan:</Title>
      <Form {...layout} name="loan-application" onFinish={onFinish} validateMessages={validateMessages}>
        <Form.Item
          name={['loan', 'amount']}
          label="Amount"
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input/>
        </Form.Item>
        <Form.Item 
          name={['loan', 'description']} 
          label="Please describe what the loan will be used for:"
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
};

export default Loan;