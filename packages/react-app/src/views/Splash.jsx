import { Image } from "antd";

const Splash = () => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Image
        style={{ width: "100%" }}
        src="https://ipfs.io/ipfs/QmZTiEgrTYAuxXSQSX8A894P4c39hi5VinzDmpCU1FgDkE?filename=LoanDAOLogo.png"
      />
    </div>
  );
};

export default Splash;
